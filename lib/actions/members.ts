"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getLang, type Lang } from "@/lib/lang/server";
import { checkLimit } from "@/lib/ratelimit";
import { getAdminContext, getSignedInUserId, getSuperAdminContext, type AdminContext } from "@/lib/members/auth";
import { deleteAccount, inviteAccount, inviteRedirectUrl } from "@/lib/members/account-admin";
import {
  canActOn,
  confirmationMatches,
  confirmationName,
  isSuperAdminGuardError,
} from "@/lib/members/permissions";
import { dobToBirthDateText, hasArabic, splitFullName } from "@/lib/members/match";
import { searchClaimCandidates } from "@/lib/members/search";
import { canTransitionRequest, isLastAdminError } from "@/lib/members/rules";
import { canRemoveAccess } from "@/lib/members/approval";
import { buildRequestNote } from "@/lib/members/request-note";
import { resolveSuggestionSchema, suggestRelativeSchema, type SuggestRelativeInput } from "@/lib/members/suggestions";
import { notifyAdminsOfRequest, notifyAdminsOfSuggestion, notifyMemberApproved } from "@/lib/notify/email";
import type { ClaimCandidate, MemberActionResult, MemberRole } from "@/lib/members/types";
import {
  addFamilyMemberSchema,
  deleteMemberSchema,
  inviteMemberSchema,
  type InviteMemberInput,
  linkProfileSchema,
  linkRequestToPersonSchema,
  memberRoleSchema,
  requestIdSchema,
  searchClaimSchema,
  submitLinkRequestSchema,
  unlinkProfileSchema,
  type SubmitLinkRequestInput,
} from "@/lib/validation/members";
import { createPersonQuick } from "@/lib/actions/people";

// ── helpers ──────────────────────────────────────────────────────────────────

type Translate = (en: string, ar: string) => string;
const translator = (lang: Lang): Translate => (en, ar) => (lang === "ar" ? ar : en);

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function refresh() {
  revalidatePath("/admin/members");
  revalidatePath("/welcome");
  revalidatePath("/");
}

type LinkRequestRow = {
  id: string;
  profile_id: string;
  person_id: string | null;
  parents_note: string | null;
  status: "pending" | "approved" | "declined" | "cancelled";
};

async function loadPendingRequest(
  ctx: AdminContext,
  requestId: string,
  t: Translate,
): Promise<{ ok: true; request: LinkRequestRow } | { ok: false; error: string }> {
  const { data } = await ctx.supabase
    .from("link_requests")
    .select("id, profile_id, person_id, parents_note, status")
    .eq("id", requestId)
    .maybeSingle();
  const request = data as LinkRequestRow | null;
  if (!request) return fail(t("That request no longer exists.", "هذا الطلب لم يعد موجودًا."));
  if (!canTransitionRequest("admin", request.status, "approved")) {
    return fail(
      t("Someone already handled this request.", "تمت معالجة هذا الطلب بالفعل."),
    );
  }
  return { ok: true, request };
}

/**
 * Point a profile at a person, then close that member's pending request (if any)
 * as approved. Every guard is checked here; the DB trigger and the unique
 * constraint on profiles.person_id back it up.
 */
async function linkProfile(
  ctx: AdminContext,
  profileId: string,
  personId: string,
  t: Translate,
): Promise<MemberActionResult> {
  const { supabase, userId } = ctx;

  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("id", personId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!person) return fail(t("That person is no longer in the tree.", "هذا الشخص لم يعد في الشجرة."));

  const { data: other } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("person_id", personId)
    .neq("id", profileId)
    .maybeSingle();
  if (other) {
    const who = (other as { full_name: string | null; email: string | null }).full_name ??
      (other as { email: string | null }).email ?? t("another member", "عضو آخر");
    return fail(
      t(
        `That person is already linked to ${who}. Unlink them first.`,
        `هذا الشخص مرتبط بالفعل بـ ${who}. افصل الارتباط أولًا.`,
      ),
    );
  }

  // Linking someone to a person also lets them in (if an admin hasn't already).
  const { data: current } = await supabase
    .from("profiles")
    .select("approved_at")
    .eq("id", profileId)
    .maybeSingle();
  const newlyApproved = !!current && (current as { approved_at: string | null }).approved_at === null;

  const { data: updated, error } = await supabase
    .from("profiles")
    .update(newlyApproved ? { person_id: personId, approved_at: new Date().toISOString() } : { person_id: personId })
    .eq("id", profileId)
    .select("id");
  if (error) {
    if (error.code === "23505") {
      return fail(
        t("That person is already linked to another account.", "هذا الشخص مرتبط بحساب آخر بالفعل."),
      );
    }
    return fail(t("Couldn't save the link. Please try again.", "تعذّر حفظ الارتباط. حاول مرة أخرى."));
  }
  if (!updated || updated.length === 0) {
    return fail(t("That member no longer exists.", "هذا العضو لم يعد موجودًا."));
  }

  await supabase
    .from("link_requests")
    .update({ status: "approved", person_id: personId, reviewed_by: userId })
    .eq("profile_id", profileId)
    .eq("status", "pending");

  if (newlyApproved) {
    const lang = await getLang();
    after(() => notifyMemberApproved(profileId, lang));
  }
  refresh();
  return { ok: true };
}

// ═════════════════════════════════════════════════════════════════════════════
// Member-facing actions (any signed-in user, acting on their own account)
// ═════════════════════════════════════════════════════════════════════════════

/** Live search for the "Find yourself" screen. DOB comes from the profile, never the client. */
export async function searchClaimCandidatesAction(
  input: { query: string },
): Promise<MemberActionResult<ClaimCandidate[]>> {
  const t = translator(await getLang());
  const parsed = searchClaimSchema.safeParse(input);
  if (!parsed.success) return fail(t("That search is too long.", "عبارة البحث طويلة جدًا."));

  const ctx = await getSignedInUserId();
  if (!ctx) return fail(t("Please sign in again.", "يرجى تسجيل الدخول مرة أخرى."));

  const limit = await checkLimit("generic", `members-search:${ctx.userId}`);
  if (!limit.success) {
    return fail(t("Slow down a moment and try again.", "تمهّل قليلًا ثم حاول مرة أخرى."));
  }

  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("date_of_birth")
    .eq("id", ctx.userId)
    .maybeSingle();

  const results = await searchClaimCandidates(ctx.supabase, {
    query: parsed.data.query,
    dob: (profile as { date_of_birth: string | null } | null)?.date_of_birth ?? null,
  });
  return { ok: true, data: results };
}

/** "This is me" (personId set) or "I'm not in the tree yet" (personId null). */
export async function submitLinkRequest(input: SubmitLinkRequestInput): Promise<MemberActionResult> {
  const t = translator(await getLang());
  const parsed = submitLinkRequestSchema.safeParse(input);
  if (!parsed.success) {
    return fail(t("Please check your answer and try again.", "يرجى مراجعة إجابتك والمحاولة مرة أخرى."));
  }

  const ctx = await getSignedInUserId();
  if (!ctx) return fail(t("Please sign in again.", "يرجى تسجيل الدخول مرة أخرى."));
  const { supabase, userId } = ctx;

  const limit = await checkLimit("generic", `members-request:${userId}`);
  if (!limit.success) {
    return fail(t("Slow down a moment and try again.", "تمهّل قليلًا ثم حاول مرة أخرى."));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("person_id")
    .eq("id", userId)
    .maybeSingle();
  if ((profile as { person_id: string | null } | null)?.person_id) {
    return fail(t("You're already linked to the family tree.", "حسابك مرتبط بالفعل بشجرة العائلة."));
  }

  const { personId } = parsed.data;
  // The extra "not in the tree" details all travel in one note for the admin.
  const note = personId
    ? null
    : buildRequestNote({
        fatherName: parsed.data.fatherName,
        motherName: parsed.data.motherName,
        invitedBy: parsed.data.invitedBy,
      }) ?? parsed.data.parentsNote;

  if (personId) {
    // An account waiting for access cannot read `people`, so existence is checked
    // by the foreign key on insert (23503) instead of a lookup.
    const { data: claimedData } = await supabase.rpc("claimed_person_ids");
    if (((claimedData as string[] | null) ?? []).includes(personId)) {
      return fail(
        t(
          "Someone has already claimed that person. Pick another, or ask an admin.",
          "هناك من اختار هذا الشخص بالفعل. اختر شخصًا آخر أو اسأل المشرف.",
        ),
      );
    }
  }

  const { error } = await supabase.from("link_requests").insert({
    profile_id: userId,
    person_id: personId,
    parents_note: note,
    status: "pending",
  });
  if (error) {
    if (error.code === "23503") {
      return fail(t("That person is no longer in the tree.", "هذا الشخص لم يعد في الشجرة."));
    }
    if (error.code === "23505") {
      return fail(
        t(
          "You already have a request waiting for an admin.",
          "لديك طلب بانتظار المشرف بالفعل.",
        ),
      );
    }
    return fail(t("Couldn't send your request. Please try again.", "تعذّر إرسال طلبك. حاول مرة أخرى."));
  }

  after(() => notifyAdminsOfRequest({ profileId: userId, personId }));
  refresh();
  return { ok: true };
}

/** "I picked the wrong person": withdraw my own pending request. */
export async function cancelMyLinkRequest(): Promise<MemberActionResult> {
  const t = translator(await getLang());
  const ctx = await getSignedInUserId();
  if (!ctx) return fail(t("Please sign in again.", "يرجى تسجيل الدخول مرة أخرى."));

  const { data, error } = await ctx.supabase
    .from("link_requests")
    .update({ status: "cancelled" })
    .eq("profile_id", ctx.userId)
    .eq("status", "pending")
    .select("id");
  if (error) {
    return fail(t("Couldn't cancel your request. Please try again.", "تعذّر إلغاء طلبك. حاول مرة أخرى."));
  }
  if (!data || data.length === 0) {
    return fail(
      t(
        "That request was already handled, so there's nothing to cancel.",
        "تمت معالجة هذا الطلب بالفعل، فلا يوجد ما يُلغى.",
      ),
    );
  }
  refresh();
  return { ok: true };
}

// ═════════════════════════════════════════════════════════════════════════════
// Admin actions. Each one re-checks the caller's role on the server.
// ═════════════════════════════════════════════════════════════════════════════

const FORBIDDEN = (t: Translate) => fail(t("Only admins can do that.", "هذا الإجراء للمشرفين فقط."));
const BAD_INPUT = (t: Translate) =>
  fail(t("Something looked wrong with that request.", "حدث خطأ في بيانات الطلب."));

/** Approve: link the account to the person it claimed. */
export async function approveLinkRequest(input: { requestId: string }): Promise<MemberActionResult> {
  const t = translator(await getLang());
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN(t);
  const parsed = requestIdSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT(t);

  const loaded = await loadPendingRequest(ctx, parsed.data.requestId, t);
  if (!loaded.ok) return loaded;
  if (!loaded.request.person_id) {
    return fail(
      t(
        "This member isn't in the tree yet. Use \"Add to tree & link\" instead.",
        "هذا العضو غير موجود في الشجرة بعد. استخدم «أضِف إلى الشجرة واربط».",
      ),
    );
  }
  const result = await linkProfile(ctx, loaded.request.profile_id, loaded.request.person_id, t);
  return result.ok ? { ok: true, message: t("Linked.", "تم الربط.") } : result;
}

/** Pick someone else: link the requesting account to a different person. */
export async function linkRequestToPerson(
  input: { requestId: string; personId: string },
): Promise<MemberActionResult> {
  const t = translator(await getLang());
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN(t);
  const parsed = linkRequestToPersonSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT(t);

  const loaded = await loadPendingRequest(ctx, parsed.data.requestId, t);
  if (!loaded.ok) return loaded;
  const result = await linkProfile(ctx, loaded.request.profile_id, parsed.data.personId, t);
  return result.ok ? { ok: true, message: t("Linked.", "تم الربط.") } : result;
}

export async function declineLinkRequest(input: { requestId: string }): Promise<MemberActionResult> {
  const t = translator(await getLang());
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN(t);
  const parsed = requestIdSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT(t);

  const { data, error } = await ctx.supabase
    .from("link_requests")
    .update({ status: "declined", reviewed_by: ctx.userId })
    .eq("id", parsed.data.requestId)
    .eq("status", "pending")
    .select("id");
  if (error) return fail(t("Couldn't decline. Please try again.", "تعذّر الرفض. حاول مرة أخرى."));
  if (!data || data.length === 0) {
    return fail(t("Someone already handled this request.", "تمت معالجة هذا الطلب بالفعل."));
  }
  refresh();
  return { ok: true, message: t("Request declined.", "تم رفض الطلب.") };
}

/** "Not in the tree" requests: create the person from their name + DOB, then link. */
export async function addToTreeAndLink(input: { requestId: string }): Promise<MemberActionResult> {
  const t = translator(await getLang());
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN(t);
  const parsed = requestIdSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT(t);

  const loaded = await loadPendingRequest(ctx, parsed.data.requestId, t);
  if (!loaded.ok) return loaded;
  const { request } = loaded;

  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("id, full_name, display_name, email, date_of_birth, person_id")
    .eq("id", request.profile_id)
    .maybeSingle();
  const p = profile as {
    full_name: string | null;
    display_name: string | null;
    email: string | null;
    date_of_birth: string | null;
    person_id: string | null;
  } | null;
  if (!p) return fail(t("That member no longer exists.", "هذا العضو لم يعد موجودًا."));
  if (p.person_id) {
    return fail(t("That member is already linked.", "هذا العضو مرتبط بالفعل."));
  }

  const fullName = (p.full_name ?? p.display_name ?? "").trim();
  if (!fullName) {
    return fail(
      t(
        "This member didn't give a name, so we can't create them. Link them to someone instead.",
        "لم يُدخل هذا العضو اسمه، لذا لا يمكن إنشاؤه. اربطه بشخص موجود.",
      ),
    );
  }

  const { given, family } = splitFullName(fullName);
  const arabic = hasArabic(fullName);
  const notes = [
    `Self-registered as "${fullName}".`,
    request.parents_note ? `In their words:\n${request.parents_note}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const form = new FormData();
  form.set(arabic ? "given_ar" : "given_en", given);
  if (family) form.set(arabic ? "family_name_ar" : "family_name_en", family);
  form.set("gender", "unknown");
  form.set("is_placeholder", "false");
  form.set("notes_en", notes);
  const birth = dobToBirthDateText(p.date_of_birth);
  if (birth) form.set("birth_date", birth);

  const created = await createPersonQuick(null, form);
  if (!created?.success || !created.personId) {
    return fail(created?.error ?? t("Couldn't add them to the tree.", "تعذّرت إضافته إلى الشجرة."));
  }

  const linked = await linkProfile(ctx, request.profile_id, created.personId, t);
  if (!linked.ok) {
    return fail(
      t(
        `They were added to the tree, but linking failed: ${linked.error} Use "Link to tree" on the All members tab.`,
        `تمت إضافته إلى الشجرة لكن الربط فشل: ${linked.error} استخدم «اربط بالشجرة» في تبويب كل الأعضاء.`,
      ),
    );
  }
  return { ok: true, message: t("Added to the tree and linked.", "تمت الإضافة إلى الشجرة والربط.") };
}

/** All members: link (or re-link) an account to a person. */
export async function linkMemberToPerson(
  input: { profileId: string; personId: string },
): Promise<MemberActionResult> {
  const t = translator(await getLang());
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN(t);
  const parsed = linkProfileSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT(t);
  const result = await linkProfile(ctx, parsed.data.profileId, parsed.data.personId, t);
  return result.ok ? { ok: true, message: t("Link saved.", "تم حفظ الارتباط.") } : result;
}

export async function unlinkMember(input: { profileId: string }): Promise<MemberActionResult> {
  const t = translator(await getLang());
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN(t);
  const parsed = unlinkProfileSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT(t);

  const { data, error } = await ctx.supabase
    .from("profiles")
    .update({ person_id: null })
    .eq("id", parsed.data.profileId)
    .select("id");
  if (error || !data || data.length === 0) {
    return fail(t("Couldn't unlink. Please try again.", "تعذّر فصل الارتباط. حاول مرة أخرى."));
  }
  refresh();
  return { ok: true, message: t("Unlinked.", "تم فصل الارتباط.") };
}

export async function changeMemberRole(
  input: { profileId: string; role: MemberRole },
): Promise<MemberActionResult> {
  const t = translator(await getLang());
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN(t);
  const parsed = memberRoleSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT(t);
  const { profileId, role } = parsed.data;

  // Normal admins can switch Viewer <-> Editor; anything to or from Admin is the
  // owner's call (the database guard enforces the same rule).
  const { data: target } = await ctx.supabase
    .from("profiles")
    .select("id, role, is_super_admin")
    .eq("id", profileId)
    .maybeSingle();
  if (!target) return fail(t("That member no longer exists.", "هذا العضو لم يعد موجودًا."));
  const verdict = canActOn(
    ctx.isSuperAdmin ? "super_admin" : "admin",
    ctx.userId,
    "change_role",
    { id: target.id, role: target.role, isSuperAdmin: target.is_super_admin },
    role,
  );
  if (!verdict.ok) {
    if (verdict.reason === "super_admin") {
      return fail(t("The owner's account can't be changed.", "لا يمكن تغيير حساب المالك."));
    }
    if (verdict.reason === "forbidden") {
      return fail(
        t("Only the owner can make or remove admins.", "المالك وحده يستطيع تعيين المشرفين أو إزالتهم."),
      );
    }
    return fail(t("That's already their permission.", "هذه صلاحيتهم الحالية بالفعل."));
  }

  // No read-then-write pre-check: the profiles_guard trigger decides, under an
  // advisory lock, so two admins demoting each other at once can't both win.
  const { data, error } = await ctx.supabase
    .from("profiles")
    .update({ role })
    .eq("id", profileId)
    .select("id");
  if (isLastAdminError(error)) {
    return fail(
      t(
        "There must always be at least one admin. Make someone else an admin first.",
        "يجب أن يبقى مشرف واحد على الأقل. اجعل شخصًا آخر مشرفًا أولًا.",
      ),
    );
  }
  if (isSuperAdminGuardError(error)) {
    return fail(
      t("Only the owner can make or remove admins.", "المالك وحده يستطيع تعيين المشرفين أو إزالتهم."),
    );
  }
  if (error || !data || data.length === 0) {
    return fail(t("Couldn't change the role. Please try again.", "تعذّر تغيير الصلاحية. حاول مرة أخرى."));
  }
  refresh();
  return { ok: true, message: t("Permissions updated.", "تم تحديث الصلاحيات.") };
}

// ═════════════════════════════════════════════════════════════════════════════
// Owner-only: add a member, delete an account. Each re-reads is_super_admin from
// the database; the service-role work lives in lib/members/account-admin.ts.
// ═════════════════════════════════════════════════════════════════════════════

const OWNER_ONLY = (t: Translate) =>
  fail(t("Only the owner can do that.", "هذا الإجراء للمالك فقط."));

export type InviteMemberResult =
  | { ok: true; message: string; profileId: string }
  | { ok: false; error: string; existingProfileId?: string | null };

/** Add a member by email: sends Supabase's invite, then sets role, approval and link. */
export async function inviteMember(input: InviteMemberInput): Promise<InviteMemberResult> {
  const t = translator(await getLang());
  const ctx = await getSuperAdminContext();
  if (!ctx) return OWNER_ONLY(t);
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return fail(
      field === "email"
        ? t("Enter a valid email address.", "أدخل بريدًا إلكترونيًا صحيحًا.")
        : field === "dateOfBirth"
          ? t("Enter a valid date of birth, or leave it empty.", "أدخل تاريخ ميلاد صحيحًا أو اتركه فارغًا.")
          : field === "fullName"
            ? t("Enter their full name.", "أدخل اسمه الكامل.")
            : t("Something looked wrong with that form.", "حدث خطأ في بيانات النموذج."),
    );
  }

  const limit = await checkLimit("generic", `members-invite:${ctx.userId}`);
  if (!limit.success) return fail(t("Slow down a moment and try again.", "تمهّل قليلًا ثم حاول مرة أخرى."));

  const d = parsed.data;
  if (d.personId) {
    const { data: person } = await ctx.supabase
      .from("people")
      .select("id")
      .eq("id", d.personId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!person) return fail(t("That person is no longer in the tree.", "هذا الشخص لم يعد في الشجرة."));
    const { data: owner } = await ctx.supabase.from("profiles").select("id").eq("person_id", d.personId).maybeSingle();
    if (owner) {
      return fail(
        t("That person is already linked to an account.", "هذا الشخص مرتبط بحساب بالفعل."),
      );
    }
  }

  const result = await inviteAccount({
    adminId: ctx.userId,
    email: d.email,
    fullName: d.fullName,
    dateOfBirth: d.dateOfBirth,
    role: d.role,
    approveNow: d.approveNow,
    personId: d.personId,
    redirectTo: await inviteRedirectUrl(),
  });
  if (!result.ok) {
    if (result.reason === "exists") {
      return {
        ok: false,
        error: t("There's already an account with that email.", "يوجد حساب بهذا البريد بالفعل."),
        existingProfileId: result.profileId,
      };
    }
    return fail(
      t(
        "Couldn't send the invitation. Check the email address and try again.",
        "تعذّر إرسال الدعوة. تحقق من البريد وحاول مرة أخرى.",
      ),
    );
  }
  refresh();
  if (result.setupWarning) {
    return {
      ok: true,
      profileId: result.profileId,
      message: t(
        "Invitation sent, but some settings didn't save. Check their row in All members.",
        "أُرسلت الدعوة لكن بعض الإعدادات لم تُحفظ. راجع صفّه في كل الأعضاء.",
      ),
    };
  }
  return {
    ok: true,
    profileId: result.profileId,
    message: t(`Invitation sent to ${d.email}.`, `أُرسلت الدعوة إلى ${d.email}.`),
  };
}

/** Delete an account for good. The person in the tree stays, just unlinked. */
export async function deleteMember(input: { profileId: string; confirmName: string }): Promise<MemberActionResult> {
  const t = translator(await getLang());
  const ctx = await getSuperAdminContext();
  if (!ctx) return OWNER_ONLY(t);
  const parsed = deleteMemberSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT(t);

  const { data: target } = await ctx.supabase
    .from("profiles")
    .select("id, role, is_super_admin, full_name, display_name, email, person_id")
    .eq("id", parsed.data.profileId)
    .maybeSingle();
  if (!target) return fail(t("That member no longer exists.", "هذا العضو لم يعد موجودًا."));

  const verdict = canActOn(
    "super_admin",
    ctx.userId,
    "delete_account",
    { id: target.id, role: target.role, isSuperAdmin: target.is_super_admin },
  );
  if (!verdict.ok) {
    return fail(
      verdict.reason === "self"
        ? t("You can't delete your own account here.", "لا يمكنك حذف حسابك من هنا.")
        : t("The owner's account can't be deleted.", "لا يمكن حذف حساب المالك."),
    );
  }
  if (!confirmationMatches(parsed.data.confirmName, confirmationName(target))) {
    return fail(t("The name you typed doesn't match.", "الاسم الذي كتبته غير مطابق."));
  }

  const result = await deleteAccount({
    adminId: ctx.userId,
    profileId: target.id,
    // No email or date of birth in the audit trail.
    snapshot: { full_name: target.full_name, role: target.role, person_id: target.person_id },
  });
  if (!result.ok) {
    return fail(t("Couldn't delete that account. Please try again.", "تعذّر حذف الحساب. حاول مرة أخرى."));
  }
  refresh();
  return { ok: true, message: t("Account deleted.", "تم حذف الحساب.") };
}

// ── Access: let in without linking / remove access ─────────────────────────

/** "Let in without linking": approve the account without tying it to a person. */
export async function letInMember(input: { profileId: string }): Promise<MemberActionResult> {
  const t = translator(await getLang());
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN(t);
  const parsed = unlinkProfileSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT(t);

  const { data, error } = await ctx.supabase
    .from("profiles")
    .update({ approved_at: new Date().toISOString() })
    .eq("id", parsed.data.profileId)
    .is("approved_at", null)
    .select("id");
  if (error) return fail(t("Couldn't let them in. Please try again.", "تعذّر السماح لهم بالدخول. حاول مرة أخرى."));
  if (!data || data.length === 0) {
    return fail(t("That member was already let in.", "تم السماح لهذا العضو بالدخول بالفعل."));
  }
  const lang = await getLang();
  after(() => notifyMemberApproved(parsed.data.profileId, lang));
  refresh();
  return { ok: true, message: t("They're in.", "تم السماح لهم بالدخول.") };
}

/** "Remove access": back to waiting. Refused for admins; also unlinks the person. */
export async function removeMemberAccess(input: { profileId: string }): Promise<MemberActionResult> {
  const t = translator(await getLang());
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN(t);
  const parsed = unlinkProfileSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT(t);

  const { data: target } = await ctx.supabase
    .from("profiles")
    .select("role")
    .eq("id", parsed.data.profileId)
    .maybeSingle();
  if (!target) return fail(t("That member no longer exists.", "هذا العضو لم يعد موجودًا."));
  if (!canRemoveAccess((target as { role: MemberRole }).role)) {
    return fail(
      t(
        "Admins always have access. Change their role first.",
        "للمشرفين صلاحية دائمة. غيّر دورهم أولًا.",
      ),
    );
  }

  const { data, error } = await ctx.supabase
    .from("profiles")
    .update({ approved_at: null, person_id: null })
    .eq("id", parsed.data.profileId)
    .select("id");
  if (error || !data || data.length === 0) {
    return fail(t("Couldn't remove access. Please try again.", "تعذّرت إزالة الوصول. حاول مرة أخرى."));
  }
  refresh();
  return { ok: true, message: t("Access removed.", "تمت إزالة الوصول.") };
}

// ═════════════════════════════════════════════════════════════════════════════
// Suggested relatives
// ═════════════════════════════════════════════════════════════════════════════

/** "Suggest a relative": any signed-in account, including one still waiting for access. */
export async function suggestRelative(input: SuggestRelativeInput): Promise<MemberActionResult> {
  const t = translator(await getLang());
  const parsed = suggestRelativeSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      t(
        "Please add their name and how they're related to you.",
        "يرجى إدخال اسمه وصلة قرابته بك.",
      ),
    );
  }
  const ctx = await getSignedInUserId();
  if (!ctx) return fail(t("Please sign in again.", "يرجى تسجيل الدخول مرة أخرى."));

  const limit = await checkLimit("generic", `members-suggest:${ctx.userId}`);
  if (!limit.success) {
    return fail(t("Slow down a moment and try again.", "تمهّل قليلًا ثم حاول مرة أخرى."));
  }

  const { name, relation, note } = parsed.data;
  const { error } = await ctx.supabase
    .from("relative_suggestions")
    .insert({ suggested_by: ctx.userId, name, relation, note, status: "pending" });
  if (error) {
    if (error.hint === "suggestion_limit") {
      return fail(
        t(
          "That's plenty for today. Please try again tomorrow.",
          "هذا يكفي لليوم. حاول مرة أخرى غدًا.",
        ),
      );
    }
    return fail(t("Couldn't send that. Please try again.", "تعذّر الإرسال. حاول مرة أخرى."));
  }

  after(() => notifyAdminsOfSuggestion({ profileId: ctx.userId, relativeName: name, relation }));
  refresh();
  return { ok: true, message: t("Thanks! An admin will take a look.", "شكرًا لك! سيطّلع عليه المشرف.") };
}

/** Admin: "Already in tree" or "Dismiss". ("Add to tree" is handled by addFamilyMember.) */
export async function resolveSuggestion(
  input: { suggestionId: string; outcome: "already_in_tree" | "dismissed" },
): Promise<MemberActionResult> {
  const t = translator(await getLang());
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN(t);
  const parsed = resolveSuggestionSchema.safeParse(input);
  if (!parsed.success || (input.outcome !== "already_in_tree" && input.outcome !== "dismissed")) {
    return BAD_INPUT(t);
  }
  const { data, error } = await ctx.supabase
    .from("relative_suggestions")
    .update({ status: input.outcome })
    .eq("id", parsed.data.suggestionId)
    .eq("status", "pending")
    .select("id");
  if (error) return fail(t("Couldn't save that. Please try again.", "تعذّر الحفظ. حاول مرة أخرى."));
  if (!data || data.length === 0) {
    return fail(t("Someone already handled this suggestion.", "تمت معالجة هذا الاقتراح بالفعل."));
  }
  refresh();
  return {
    ok: true,
    message:
      input.outcome === "dismissed" ? t("Dismissed.", "تم الاستبعاد.") : t("Marked as already in the tree.", "تم تسجيله كموجود في الشجرة."),
  };
}

/** Close the "finish your profile" card for good. */
export async function dismissProfileChecklist(): Promise<MemberActionResult> {
  const t = translator(await getLang());
  const ctx = await getSignedInUserId();
  if (!ctx) return fail(t("Please sign in again.", "يرجى تسجيل الدخول مرة أخرى."));
  const { error } = await ctx.supabase.rpc("dismiss_checklist");
  if (error) return fail(t("Couldn't hide that. Please try again.", "تعذّر الإخفاء. حاول مرة أخرى."));
  revalidatePath("/");
  return { ok: true };
}

// ── Add a family member (no account) ─────────────────────────────────────────

export type AddFamilyMemberState =
  | { ok: true; personId: string; message: string }
  | {
      ok: false;
      error?: string;
      fieldErrors?: Record<string, string>;
      /** What was typed, so the form can refill itself (React resets forms after an action). */
      values?: Record<string, string>;
    }
  | null;

/** Admin-only wrapper over createPersonQuick (lib/actions/people.ts) for people without an account. */
export async function addFamilyMember(
  _prev: AddFamilyMemberState,
  formData: FormData,
): Promise<AddFamilyMemberState> {
  const t = translator(await getLang());
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: t("Only admins can do that.", "هذا الإجراء للمشرفين فقط.") };

  const text = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : null;
  };
  const values: Record<string, string> = {};
  for (const k of ["given_en", "given_ar", "family_name_en", "family_name_ar", "gender", "birth_date"]) {
    values[k] = text(k) ?? "";
  }
  const parsed = addFamilyMemberSchema.safeParse({
    given_en: text("given_en"),
    given_ar: text("given_ar"),
    family_name_en: text("family_name_en"),
    family_name_ar: text("family_name_ar"),
    gender: text("gender") ?? "unknown",
    birth_date: text("birth_date"),
    father_id: text("father_id"),
    mother_id: text("mother_id"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? "_";
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, fieldErrors, values };
  }
  const d = parsed.data;

  // Sanity-check the parents so the tree never shows a "mother" who is a man.
  for (const [role, id] of [["father", d.father_id], ["mother", d.mother_id]] as const) {
    if (!id) continue;
    const { data: parent } = await ctx.supabase
      .from("people")
      .select("gender")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    const g = (parent as { gender: string } | null)?.gender;
    if (!parent) {
      return {
        ok: false,
        values,
        fieldErrors: { [`${role}_id`]: t("Pick someone from the tree.", "اختر شخصًا من الشجرة.") },
      };
    }
    if ((role === "father" && g === "f") || (role === "mother" && g === "m")) {
      return {
        ok: false,
        values,
        fieldErrors: {
          [`${role}_id`]:
            role === "father"
              ? t("A father can't be marked female.", "لا يمكن أن يكون الأب مسجّلًا كأنثى.")
              : t("A mother can't be marked male.", "لا يمكن أن تكون الأم مسجّلة كذكر."),
        },
      };
    }
  }

  const form = new FormData();
  for (const key of ["given_en", "given_ar", "family_name_en", "family_name_ar", "birth_date", "father_id", "mother_id"] as const) {
    const v = d[key];
    if (v) form.set(key, v);
  }
  form.set("gender", d.gender);
  form.set("is_placeholder", "false");

  const created = await createPersonQuick(null, form);
  if (!created?.success || !created.personId) {
    return {
      ok: false,
      error: created?.error ?? t("Couldn't add this person.", "تعذّرت إضافة هذا الشخص."),
      values,
    };
  }
  // Added from a suggested relative: mark that suggestion as handled.
  const suggestionId = text("suggestion_id");
  if (suggestionId && /^[0-9a-f-]{36}$/i.test(suggestionId)) {
    await ctx.supabase
      .from("relative_suggestions")
      .update({ status: "added", person_id: created.personId })
      .eq("id", suggestionId)
      .eq("status", "pending");
  }
  refresh();
  return {
    ok: true,
    personId: created.personId,
    message: t("Added to the family tree.", "تمت الإضافة إلى شجرة العائلة."),
  };
}
