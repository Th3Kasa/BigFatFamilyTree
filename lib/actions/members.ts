"use server";

import { revalidatePath } from "next/cache";
import { getLang, type Lang } from "@/lib/lang/server";
import { checkLimit } from "@/lib/ratelimit";
import { getAdminContext, getSignedInUserId, type AdminContext } from "@/lib/members/auth";
import { dobToBirthDateText, hasArabic, splitFullName } from "@/lib/members/match";
import { searchClaimCandidates } from "@/lib/members/search";
import { canTransitionRequest, wouldRemoveLastAdmin } from "@/lib/members/rules";
import type { ClaimCandidate, MemberActionResult, MemberRole } from "@/lib/members/types";
import {
  addFamilyMemberSchema,
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

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ person_id: personId })
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

  const { personId, parentsNote } = parsed.data;

  if (personId) {
    const { data: person } = await supabase
      .from("people")
      .select("id")
      .eq("id", personId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!person) {
      return fail(t("That person is no longer in the tree.", "هذا الشخص لم يعد في الشجرة."));
    }
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
    parents_note: personId ? null : parentsNote,
    status: "pending",
  });
  if (error) {
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
    request.parents_note ? `Parents, in their words: ${request.parents_note}` : null,
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

  const { data: all } = await ctx.supabase.from("profiles").select("id, role");
  const profiles = (all ?? []) as Array<{ id: string; role: MemberRole }>;
  if (wouldRemoveLastAdmin(profiles, profileId, role)) {
    return fail(
      t(
        "There must always be at least one admin. Make someone else an admin first.",
        "يجب أن يبقى مشرف واحد على الأقل. اجعل شخصًا آخر مشرفًا أولًا.",
      ),
    );
  }

  const { data, error } = await ctx.supabase
    .from("profiles")
    .update({ role })
    .eq("id", profileId)
    .select("id");
  if (error || !data || data.length === 0) {
    return fail(t("Couldn't change the role. Please try again.", "تعذّر تغيير الصلاحية. حاول مرة أخرى."));
  }
  refresh();
  return { ok: true, message: t("Permissions updated.", "تم تحديث الصلاحيات.") };
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
  refresh();
  return {
    ok: true,
    personId: created.personId,
    message: t("Added to the family tree.", "تمت الإضافة إلى شجرة العائلة."),
  };
}
