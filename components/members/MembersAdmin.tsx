"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import {
  addToTreeAndLink,
  approveLinkRequest,
  changeMemberRole,
  declineLinkRequest,
  deleteMember,
  letInMember,
  linkMemberToPerson,
  linkRequestToPerson,
  removeMemberAccess,
  resolveSuggestion,
  unlinkMember,
} from "@/lib/actions/members";
import { resetMemberPin } from "@/lib/actions/pin";
import { canActOn, callerOf, confirmationName } from "@/lib/members/permissions";
import { formatPersonSubline } from "@/lib/members/match";
import { ROLE_ORDER, roleLabel, wouldRemoveLastAdmin } from "@/lib/members/rules";
import type {
  MemberActionResult,
  MemberAccount,
  MemberRole,
  MembersAdminData,
  PendingRequest,
  PersonSummary,
  SuggestionRow,
} from "@/lib/members/types";
import { cn, getDisplayName } from "@/lib/utils";
import { AddFamilyMemberForm, type SuggestionPrefill } from "./AddFamilyMemberForm";
import { DeleteMemberDialog, InviteMemberForm, type DeleteTarget } from "./SuperAdminPanels";
import { PickPersonDialog } from "./PickPersonDialog";
import { FamilyPinCard } from "./FamilyPinCard";
import { cardClass, fieldClass, Initials, pill, Spinner } from "./primitives";

type Lang = "ar" | "en";
type TabKey = "waiting" | "suggestions" | "all" | "add" | "invite";

type Picker =
  | { kind: "request"; requestId: string; who: string }
  | { kind: "member"; profileId: string; who: string; relink: boolean };

type Props = {
  lang: Lang;
  data: MembersAdminData;
  currentUserId: string;
  /** The owner: sees "Invite a member", "Delete account" and the Admin role. */
  isSuperAdmin: boolean;
  initialTab: TabKey;
  /** The current family PIN. Passed for the super admin only; null for everyone else. */
  familyPin?: string | null;
};

type StatusFilter = "waiting" | "approved" | "all";

function relativeJoined(iso: string, lang: Lang): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  return rtf.format(-Math.max(days, 0), "day");
}

function formatDob(iso: string | null, lang: Lang): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** Shown when the account never confirmed its email, so the address is unproven. */
function UnconfirmedBadge({ confirmed, lang }: { confirmed: boolean | null; lang: Lang }) {
  if (confirmed !== false) return null;
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  return (
    <span
      title={t(
        "They haven't clicked the link in their confirmation email yet, so this address isn't verified.",
        "لم يضغط بعد على رابط التأكيد في بريده، لذا هذا العنوان غير مؤكَّد.",
      )}
      className="ms-1.5 inline-flex items-center whitespace-nowrap rounded-full border border-[#F6D3BC] bg-[#FFF4EC] px-2 py-0.5 text-[11px] font-semibold text-[#9A3412]"
    >
      {t("Email not confirmed", "البريد غير مؤكَّد")}
    </span>
  );
}

export function MembersAdmin({ lang, data, currentUserId, isSuperAdmin, initialTab, familyPin = null }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const router = useRouter();
  const uid = useId();

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [busy, setBusy] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  // A freshly reset PIN, shown once to the admin and then gone.
  const [reveal, setReveal] = useState<{ name: string; pin: string } | null>(null);
  const [roleDraft, setRoleDraft] = useState<Record<string, MemberRole>>({});
  const [prefill, setPrefill] = useState<SuggestionPrefill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
    waiting: null,
    suggestions: null,
    all: null,
    add: null,
    invite: null,
  });

  const caller = callerOf({ role: "admin", is_super_admin: isSuperAdmin });
  const waitingCount = data.pending.length + data.waitingAccess.length;

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "waiting", label: t(`Waiting for you (${waitingCount})`, `بانتظارك (${waitingCount})`) },
    {
      key: "suggestions",
      label: t(`Suggested relatives (${data.suggestions.length})`, `أقارب مقترحون (${data.suggestions.length})`),
    },
    { key: "all", label: t(`All members (${data.members.length})`, `كل الأعضاء (${data.members.length})`) },
    { key: "add", label: t("Add a family member", "أضف فردًا من العائلة") },
    ...(isSuperAdmin ? [{ key: "invite" as const, label: t("Invite a member", "ادعُ عضوًا") }] : []),
  ];

  function onTabKey(e: React.KeyboardEvent, index: number) {
    const dir = lang === "ar" ? -1 : 1; // arrows follow reading direction
    let next = index;
    if (e.key === "ArrowRight") next = index + dir;
    else if (e.key === "ArrowLeft") next = index - dir;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length].key;
    setTab(target);
    tabRefs.current[target]?.focus();
  }

  async function run(key: string, fn: () => Promise<MemberActionResult>): Promise<boolean> {
    setBusy(key);
    try {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message ?? t("Done.", "تم."));
        router.refresh();
        return true;
      }
      toast.error(res.error);
      return false;
    } catch {
      toast.error(t("Something went wrong. Please try again.", "حدث خطأ ما. حاول مرة أخرى."));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const adminProfiles = useMemo(
    () => data.members.map((m) => ({ id: m.id, role: m.role })),
    [data.members],
  );

  const counts = useMemo(
    () => ({
      waiting: data.members.filter((m) => !m.approved).length,
      approved: data.members.filter((m) => m.approved).length,
      all: data.members.length,
    }),
    [data.members],
  );

  const filteredMembers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return data.members.filter((m) => {
      if (status === "waiting" && m.approved) return false;
      if (status === "approved" && !m.approved) return false;
      if (!q) return true;
      return [m.fullName, m.email ?? "", m.person ? getDisplayName(m.person, lang) : ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data.members, filter, status, lang]);

  async function resetPin(m: MemberAccount) {
    const first = m.fullName.split(" ")[0] || m.fullName;
    if (
      !window.confirm(
        t(
          `Reset ${m.fullName}'s PIN? Their old PIN stops working straight away.`,
          `إعادة تعيين الرمز السري لـ ${m.fullName}؟ سيتوقف رمزه القديم فورًا.`,
        ),
      )
    ) {
      return;
    }
    setBusy(`pin:${m.id}`);
    try {
      const res = await resetMemberPin({ profileId: m.id });
      if (res.ok && res.data) {
        setReveal({ name: first, pin: res.data.pin });
        router.refresh();
      } else if (!res.ok) {
        toast.error(res.error);
      }
    } catch {
      toast.error(t("Something went wrong. Please try again.", "حدث خطأ ما. حاول مرة أخرى."));
    } finally {
      setBusy(null);
    }
  }

  function changeRole(m: MemberAccount, role: MemberRole) {
    setRoleDraft((d) => ({ ...d, [m.id]: role }));
    void run(`role:${m.id}`, () => changeMemberRole({ profileId: m.id, role })).then((ok) => {
      if (!ok) setRoleDraft((d) => ({ ...d, [m.id]: m.role })); // snap back
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {reveal ? (
        <div role="status" className={cn(cardClass, "flex flex-wrap items-center gap-3 border-[#CFE0CA] bg-[#F1F7EE] p-4")}>
          <p className="min-w-0 flex-1 text-base font-semibold text-[#241517]">
            {t(`Tell ${reveal.name} the new PIN: `, `أخبر ${reveal.name} بالرمز السري الجديد: `)}
            <span dir="ltr" className="ms-1 rounded-xl bg-white px-3 py-1 text-2xl font-bold tracking-[0.25em]">
              {reveal.pin}
            </span>
            <span className="mt-1 block text-sm font-normal text-[var(--muted-foreground)]">
              {t(
                "Shown only once. They'll be asked to choose their own PIN after signing in.",
                "يظهر مرة واحدة فقط. سيُطلب منه اختيار رمزه الخاص بعد تسجيل الدخول.",
              )}
            </span>
          </p>
          <button type="button" className={pill.outline} onClick={() => setReveal(null)}>
            {t("Done", "تم")}
          </button>
        </div>
      ) : null}

      {isSuperAdmin && familyPin ? <FamilyPinCard lang={lang} pin={familyPin} /> : null}

      <div
        role="tablist"
        aria-label={t("Member lists", "قوائم الأعضاء")}
        className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-[#F4EDEA] p-1"
      >
        {tabs.map((tb, i) => (
          <button
            key={tb.key}
            ref={(el) => {
              tabRefs.current[tb.key] = el;
            }}
            type="button"
            role="tab"
            id={`${uid}-tab-${tb.key}`}
            aria-selected={tab === tb.key}
            aria-controls={`${uid}-panel-${tb.key}`}
            tabIndex={tab === tb.key ? 0 : -1}
            onClick={() => setTab(tb.key)}
            onKeyDown={(e) => onTabKey(e, i)}
            className={cn(
              "min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-semibold text-[#241517] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
              tab === tb.key ? "bg-white shadow-[0_1px_3px_rgba(36,21,23,0.12)]" : "hover:bg-white/60",
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* ── Waiting for you ─────────────────────────────────────────────── */}
      <div role="tabpanel" id={`${uid}-panel-waiting`} aria-labelledby={`${uid}-tab-waiting`} hidden={tab !== "waiting"}>
        {waitingCount === 0 ? (
          <div className={cn(cardClass, "flex flex-col items-center gap-3 px-6 py-12 text-center")}>
            <span className="flex size-16 items-center justify-center rounded-full bg-[#E3EEDF] text-[#2F5A27]">
              <Check aria-hidden="true" className="size-8" strokeWidth={2.4} />
            </span>
            <p className="text-lg font-bold">{t("No one is waiting, all caught up", "لا أحد بانتظارك، كل شيء جاهز")}</p>
            <p className="max-w-sm text-sm text-[var(--muted-foreground)]">
              {t(
                "When a family member signs up and says who they are, their request shows up here.",
                "عندما يسجّل أحد أفراد العائلة ويذكر من هو، سيظهر طلبه هنا.",
              )}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
          {data.pending.length > 0 ? (
          <ul className="flex list-none flex-col gap-3 p-0" aria-label={t("Requests waiting for review", "طلبات بانتظار المراجعة")}>
            {data.pending.map((r) => (
              <RequestCard
                key={r.id}
                r={r}
                lang={lang}
                busy={busy}
                onApprove={() => run(`approve:${r.id}`, () => approveLinkRequest({ requestId: r.id }))}
                onPickOther={() => setPicker({ kind: "request", requestId: r.id, who: r.account.fullName })}
                onDecline={() => run(`decline:${r.id}`, () => declineLinkRequest({ requestId: r.id }))}
                onAddToTree={() => run(`add:${r.id}`, () => addToTreeAndLink({ requestId: r.id }))}
              />
            ))}
          </ul>
          ) : null}

          {data.waitingAccess.length > 0 ? (
            <section aria-labelledby={`${uid}-wa-h`} className="flex flex-col gap-3">
              <div>
                <h2 id={`${uid}-wa-h`} className="text-base font-bold">
                  {t("Waiting for access", "بانتظار السماح بالدخول")}
                </h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {t(
                    "These accounts signed up but haven't asked to be linked to anyone. Let them in, link them to a person, or leave them waiting.",
                    "سجّلت هذه الحسابات لكنها لم تطلب الارتباط بأحد. اسمح لهم بالدخول أو اربطهم بشخص أو اتركهم بالانتظار.",
                  )}
                </p>
              </div>
              <ul className="flex list-none flex-col gap-3 p-0">
                {data.waitingAccess.map((a) => (
                  <WaitingCard
                    key={a.id}
                    a={a}
                    lang={lang}
                    busy={busy}
                    canDelete={isSuperAdmin && a.id !== currentUserId}
                    onLetIn={() => run(`letin:${a.id}`, () => letInMember({ profileId: a.id }))}
                    onLink={() => setPicker({ kind: "member", profileId: a.id, who: a.fullName, relink: false })}
                    onDelete={() => setDeleteTarget(toDeleteTarget(a, null))}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          </div>
        )}
      </div>

      {/* ── Suggested relatives ─────────────────────────────────────────── */}
      <div
        role="tabpanel"
        id={`${uid}-panel-suggestions`}
        aria-labelledby={`${uid}-tab-suggestions`}
        hidden={tab !== "suggestions"}
      >
        {data.suggestions.length === 0 ? (
          <div className={cn(cardClass, "flex flex-col items-center gap-3 px-6 py-12 text-center")}>
            <p className="text-lg font-bold">{t("No suggestions right now", "لا توجد اقتراحات حاليًا")}</p>
            <p className="max-w-sm text-sm text-[var(--muted-foreground)]">
              {t(
                "When a member says a relative is missing from the tree, it shows up here.",
                "عندما يذكر عضو أن قريبًا ينقص الشجرة، سيظهر هنا.",
              )}
            </p>
          </div>
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0" aria-label={t("Suggested relatives", "الأقارب المقترحون")}>
            {data.suggestions.map((sg) => (
              <SuggestionCard
                key={sg.id}
                sg={sg}
                lang={lang}
                busy={busy}
                onAdd={() => {
                  setPrefill({ suggestionId: sg.id, name: sg.name, relation: sg.relation, by: sg.suggestedBy.fullName });
                  setTab("add");
                }}
                onAlready={() => run(`sg-in:${sg.id}`, () => resolveSuggestion({ suggestionId: sg.id, outcome: "already_in_tree" }))}
                onDismiss={() => run(`sg-no:${sg.id}`, () => resolveSuggestion({ suggestionId: sg.id, outcome: "dismissed" }))}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ── All members ─────────────────────────────────────────────────── */}
      <div
        role="tabpanel"
        id={`${uid}-panel-all`}
        aria-labelledby={`${uid}-tab-all`}
        hidden={tab !== "all"}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label={t("Show members", "عرض الأعضاء")} className="flex gap-1 rounded-full bg-[#F4EDEA] p-1">
            {(
              [
                { key: "waiting", label: t(`Waiting (${counts.waiting})`, `بانتظار (${counts.waiting})`) },
                { key: "approved", label: t(`Approved (${counts.approved})`, `مقبول (${counts.approved})`) },
                { key: "all", label: t(`All (${counts.all})`, `الكل (${counts.all})`) },
              ] as const
            ).map((chip) => (
              <button
                key={chip.key}
                type="button"
                aria-pressed={status === chip.key}
                onClick={() => setStatus(chip.key)}
                className={cn(
                  "min-h-11 whitespace-nowrap rounded-full px-4 text-sm font-semibold text-[#241517] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
                  status === chip.key ? "bg-white shadow-[0_1px_3px_rgba(36,21,23,0.12)]" : "hover:bg-white/60",
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <div className="min-w-[200px] max-w-md flex-1">
            <label htmlFor={`${uid}-filter`} className="sr-only">
              {t("Search members by name", "ابحث عن عضو بالاسم")}
            </label>
            <input
              id={`${uid}-filter`}
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("Search by name", "ابحث بالاسم")}
              className={cn(fieldClass, "min-h-11 rounded-full")}
            />
          </div>
        </div>

        <section aria-labelledby={`${uid}-all-h`} className={cn(cardClass, "overflow-hidden")}>
          <h2 id={`${uid}-all-h`} className="px-4 pb-2 pt-4 text-base font-bold">
            {t("Everyone with an account", "كل من لديه حساب")}
          </h2>
          {filteredMembers.length === 0 ? (
            <p className="px-4 pb-6 text-sm text-[var(--muted-foreground)]">
              {data.members.length === 0
                ? t("No one has signed up yet.", "لم يسجّل أحد بعد.")
                : t("No members match that filter.", "لا يوجد أعضاء يطابقون هذا التصفية.")}
            </p>
          ) : (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("Members table", "جدول الأعضاء")}>
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="text-start text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                    <th scope="col" className="px-4 py-2.5 text-start font-semibold">{t("Member", "العضو")}</th>
                    <th scope="col" className="px-4 py-2.5 text-start font-semibold">{t("In the tree as", "في الشجرة باسم")}</th>
                    <th scope="col" className="px-4 py-2.5 text-start font-semibold">{t("Can", "الصلاحية")}</th>
                    <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                      <span className="sr-only">{t("Actions", "إجراءات")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((m) => {
                    const role = roleDraft[m.id] ?? m.role;
                    const soleAdmin = wouldRemoveLastAdmin(adminProfiles, m.id, "viewer");
                    const target = { id: m.id, role: m.role, isSuperAdmin: m.isSuperAdmin };
                    // A normal admin can only switch Viewer <-> Editor; the Admin role is the owner's call.
                    const roleLocked = m.isSuperAdmin || (m.role === "admin" && !isSuperAdmin);
                    const canRemoveAccessHere = !m.isSuperAdmin && canActOn(caller, currentUserId, "remove_access", target).ok && m.approved;
                    const canDeleteHere = canActOn(caller, currentUserId, "delete_account", target).ok;
                    const canResetPin = canActOn(caller, currentUserId, "reset_pin", { ...target, loginMethod: m.loginMethod }).ok;
                    const roleId = `${uid}-role-${m.id}`;
                    return (
                      <tr key={m.id} className="border-t border-[#ECE2DE] align-middle">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Initials name={m.fullName} size={36} />
                            <div className="min-w-0">
                              <div className="truncate font-semibold">
                                {m.fullName}
                                {m.id === currentUserId ? (
                                  <span className="ms-2 rounded-full bg-[#F7E7EB] px-2 py-0.5 text-xs font-semibold text-[var(--primary)]">
                                    {t("You", "أنت")}
                                  </span>
                                ) : null}
                                {m.isSuperAdmin ? (
                                  <span className="ms-2 whitespace-nowrap rounded-full bg-[var(--primary)] px-2 py-0.5 text-xs font-semibold text-white">
                                    {t("Super admin", "مشرف عام")}
                                  </span>
                                ) : null}
                                {!m.approved ? (
                                  <span className="ms-2 whitespace-nowrap rounded-full border border-[#F6D3BC] bg-[#FFF4EC] px-2 py-0.5 text-xs font-semibold text-[#9A3412]">
                                    {t("Waiting for access", "بانتظار الدخول")}
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex min-w-0 items-center text-xs text-[var(--muted-foreground)]">
                                <span className="truncate">{m.email ?? (m.loginMethod === "pin" ? t("Signs in with a PIN", "يدخل برمز سري") : "—")}</span>
                                {m.pinMustChange ? (
                                  <span className="ms-1.5 inline-flex items-center whitespace-nowrap rounded-full border border-[#F6D3BC] bg-[#FFF4EC] px-2 py-0.5 text-[11px] font-semibold text-[#9A3412]">
                                    {t("New PIN not chosen yet", "لم يختر رمزًا جديدًا بعد")}
                                  </span>
                                ) : null}
                                <UnconfirmedBadge confirmed={m.emailConfirmed} lang={lang} />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {m.person ? (
                            <Link
                              href={`/person/${m.person.slug ?? m.person.id}`}
                              className="font-medium text-[#241517] underline-offset-2 hover:underline"
                            >
                              {getDisplayName(m.person, lang)}
                            </Link>
                          ) : (
                            <span className="font-semibold text-[#9A3412]">{t("Not linked", "غير مرتبط")}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <label htmlFor={roleId} className="sr-only">
                            {t(`Permissions for ${m.fullName}`, `صلاحيات ${m.fullName}`)}
                          </label>
                          {roleLocked ? (
                            <span id={roleId} className="inline-flex min-h-11 items-center text-sm font-medium">
                              {roleLabel(m.role, lang)}
                            </span>
                          ) : (
                          <div className="flex items-center gap-2">
                            <select
                              id={roleId}
                              value={role}
                              disabled={busy === `role:${m.id}` || soleAdmin}
                              title={
                                soleAdmin
                                  ? t("The only admin can't be demoted", "لا يمكن تخفيض المشرف الوحيد")
                                  : undefined
                              }
                              onChange={(e) => changeRole(m, e.target.value as MemberRole)}
                              className="min-h-11 rounded-xl border border-[#E2D6D2] bg-white px-3 text-sm disabled:opacity-60"
                            >
                              {ROLE_ORDER.filter((r) => isSuperAdmin || r !== "admin").map((r) => (
                                <option key={r} value={r}>
                                  {roleLabel(r, lang)}
                                </option>
                              ))}
                            </select>
                            {busy === `role:${m.id}` ? <Spinner className="text-[var(--muted-foreground)]" /> : null}
                          </div>
                          )}
                          {soleAdmin && !roleLocked ? (
                            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                              {t("Only admin, keep at least one", "المشرف الوحيد، يجب بقاء واحد")}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {m.person ? (
                              <>
                                <button
                                  type="button"
                                  className={pill.link}
                                  onClick={() => setPicker({ kind: "member", profileId: m.id, who: m.fullName, relink: true })}
                                >
                                  {t("Change link", "غيّر الارتباط")}
                                </button>
                                <button
                                  type="button"
                                  className={pill.ghost}
                                  disabled={busy === `unlink:${m.id}`}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        t(
                                          `Unlink ${m.fullName} from ${getDisplayName(m.person!, lang)}?`,
                                          `فصل ${m.fullName} عن ${getDisplayName(m.person!, lang)}؟`,
                                        ),
                                      )
                                    ) {
                                      void run(`unlink:${m.id}`, () => unlinkMember({ profileId: m.id }));
                                    }
                                  }}
                                >
                                  {busy === `unlink:${m.id}` ? <Spinner /> : null}
                                  {t("Unlink", "افصل")}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className={pill.primary}
                                onClick={() => setPicker({ kind: "member", profileId: m.id, who: m.fullName, relink: false })}
                              >
                                {t("Link to tree", "اربط بالشجرة")}
                              </button>
                            )}
                            {!m.approved && !m.person ? (
                              <button
                                type="button"
                                className={pill.outline}
                                disabled={busy === `letin:${m.id}`}
                                onClick={() => run(`letin:${m.id}`, () => letInMember({ profileId: m.id }))}
                              >
                                {busy === `letin:${m.id}` ? <Spinner /> : null}
                                {t("Let in", "اسمح بالدخول")}
                              </button>
                            ) : null}
                            {canRemoveAccessHere ? (
                              <button
                                type="button"
                                className={pill.ghost}
                                disabled={busy === `access:${m.id}`}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      t(
                                        `Remove ${m.fullName}'s access? They go back to waiting and lose their link to the tree.`,
                                        `إزالة وصول ${m.fullName}؟ سيعودون إلى الانتظار ويفقدون ارتباطهم بالشجرة.`,
                                      ),
                                    )
                                  ) {
                                    void run(`access:${m.id}`, () => removeMemberAccess({ profileId: m.id }));
                                  }
                                }}
                              >
                                {busy === `access:${m.id}` ? <Spinner /> : null}
                                {t("Remove access", "أزل الوصول")}
                              </button>
                            ) : null}
                            {canResetPin ? (
                              <button
                                type="button"
                                className={pill.outline}
                                disabled={busy === `pin:${m.id}`}
                                onClick={() => void resetPin(m)}
                              >
                                {busy === `pin:${m.id}` ? <Spinner /> : null}
                                {t("Reset PIN", "أعد تعيين الرمز")}
                              </button>
                            ) : null}
                            {isSuperAdmin && canDeleteHere ? (
                              <button
                                type="button"
                                className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-[var(--destructive)] hover:bg-[#FDECEA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--destructive)]"
                                onClick={() => setDeleteTarget(toDeleteTarget(m, m.person))}
                              >
                                {t("Delete account", "احذف الحساب")}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* ── Add a family member ─────────────────────────────────────────── */}
      <div role="tabpanel" id={`${uid}-panel-add`} aria-labelledby={`${uid}-tab-add`} hidden={tab !== "add"}>
        <AddFamilyMemberForm lang={lang} people={data.people} prefill={prefill} onClearPrefill={() => setPrefill(null)} />
      </div>

      {/* ── Invite a member (owner only) ────────────────────────────────── */}
      {isSuperAdmin ? (
        <div role="tabpanel" id={`${uid}-panel-invite`} aria-labelledby={`${uid}-tab-invite`} hidden={tab !== "invite"}>
          <InviteMemberForm
            lang={lang}
            people={data.people}
            onOpenRow={(_id, email) => {
              setFilter(email);
              setTab("all");
            }}
          />
        </div>
      ) : null}

      {isSuperAdmin ? (
        <DeleteMemberDialog
          target={deleteTarget}
          lang={lang}
          onClose={() => setDeleteTarget(null)}
          onConfirm={(target, typed) =>
            run(`delete:${target.id}`, () => deleteMember({ profileId: target.id, confirmName: typed }))
          }
        />
      ) : null}

      <PickPersonDialog
        open={picker !== null}
        onOpenChange={(o) => {
          if (!o) setPicker(null);
        }}
        lang={lang}
        people={data.people}
        title={
          picker?.kind === "request"
            ? t("Pick someone else", "اختر شخصًا آخر")
            : picker?.relink
              ? t("Change link", "غيّر الارتباط")
              : t("Link to tree", "اربط بالشجرة")
        }
        description={t(
          `Who is ${picker?.who ?? "this member"} in the family tree?`,
          `من هو ${picker?.who ?? "هذا العضو"} في شجرة العائلة؟`,
        )}
        confirmLabel={t("Link", "اربط")}
        onConfirm={async (person: PersonSummary) => {
          if (!picker) return false;
          return run(`pick:${person.id}`, () =>
            picker.kind === "request"
              ? linkRequestToPerson({ requestId: picker.requestId, personId: person.id })
              : linkMemberToPerson({ profileId: picker.profileId, personId: person.id }),
          );
        }}
      />
    </div>
  );
}

// ── One waiting request ───────────────────────────────────────────────────────

function RequestCard({
  r,
  lang,
  busy,
  onApprove,
  onPickOther,
  onDecline,
  onAddToTree,
}: {
  r: PendingRequest;
  lang: Lang;
  busy: string | null;
  onApprove: () => void;
  onPickOther: () => void;
  onDecline: () => void;
  onAddToTree: () => void;
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const who = r.account.fullName;
  const dob = formatDob(r.account.dateOfBirth, lang);
  const working = busy !== null && busy.endsWith(r.id);
  const personName = r.person ? getDisplayName(r.person, lang) : null;

  return (
    <li className={cn(cardClass, "flex flex-wrap items-center gap-4 p-4")}>
      <div className="flex min-w-0 flex-1 basis-[220px] items-center gap-3">
        <Initials name={who} size={44} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold">{who}</div>
          <div className="break-words text-[13px] text-[var(--muted-foreground)]">
            {r.account.email ?? "—"}
            <UnconfirmedBadge confirmed={r.account.emailConfirmed} lang={lang} /> ·{" "}
            <span suppressHydrationWarning>
              {t("joined", "انضم")} {relativeJoined(r.createdAt, lang)}
            </span>
          </div>
          {dob ? (
            <div className="text-[13px] text-[var(--muted-foreground)]">
              {t("Born", "مواليد")} {dob}
            </div>
          ) : null}
        </div>
      </div>

      {r.person ? (
        <>
          <span className="text-[13px] text-[var(--muted-foreground)]">{t("says they are", "يقول إنه")}</span>
          <div className="flex min-w-0 flex-1 basis-[240px] items-center gap-3 rounded-[14px] border border-[#ECE2DE] bg-[#FBF7F4] px-3 py-2">
            <Initials name={personName ?? "?"} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{personName}</div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {formatPersonSubline(r.person, lang) || t("No details yet", "لا توجد تفاصيل بعد")}
              </div>
              {r.personClaimedByOther ? (
                <div className="mt-0.5 text-xs font-semibold text-[#9A3412]">
                  {t("Already linked to another account", "مرتبط بحساب آخر بالفعل")}
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <div className="min-w-0 flex-1 basis-[280px] rounded-[14px] border border-[#F6D3BC] bg-[#FFF4EC] px-3 py-2.5">
          <div className="text-sm font-bold text-[#9A3412]">{t("Not in the tree yet", "غير موجود في الشجرة بعد")}</div>
          {r.parentsNote ? (
            <div className="whitespace-pre-line break-words text-[13px] text-[#3D2B2E]">{r.parentsNote}</div>
          ) : (
            <div className="text-[13px] text-[#3D2B2E]">
              {t("Didn't say who their parents are", "لم يذكر من هما والداه")}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {r.person ? (
          <>
            <button
              type="button"
              className={pill.primary}
              disabled={working || r.personClaimedByOther}
              onClick={onApprove}
            >
              {busy === `approve:${r.id}` ? <Spinner /> : null}
              {t("Approve & let in", "وافق واسمح بالدخول")}
            </button>
            <button type="button" className={pill.outline} disabled={working} onClick={onPickOther}>
              {t("Pick someone else", "اختر شخصًا آخر")}
            </button>
          </>
        ) : (
          <>
            <button type="button" className={pill.primary} disabled={working} onClick={onAddToTree}>
              {busy === `add:${r.id}` ? <Spinner /> : null}
              {t("Add to tree & link", "أضِف إلى الشجرة واربط")}
            </button>
            <button type="button" className={pill.outline} disabled={working} onClick={onPickOther}>
              {t("Link to someone", "اربط بشخص")}
            </button>
          </>
        )}
        <button
          type="button"
          className={pill.ghost}
          disabled={working}
          aria-label={t(`Decline ${who}'s request`, `ارفض طلب ${who}`)}
          onClick={onDecline}
        >
          {busy === `decline:${r.id}` ? <Spinner /> : null}
          {t("Decline", "ارفض")}
        </button>
      </div>
    </li>
  );
}

function toDeleteTarget(a: MemberAccount, person: PersonSummary | null): DeleteTarget {
  return {
    id: a.id,
    confirmName: confirmationName({ full_name: a.fullName, email: a.email }),
    treeName: person ? getDisplayName(person, "en") : null,
  };
}

// ── One account waiting for a decision ────────────────────────────────────────

function WaitingCard({
  a,
  lang,
  busy,
  canDelete,
  onLetIn,
  onLink,
  onDelete,
}: {
  a: MemberAccount;
  lang: Lang;
  busy: string | null;
  canDelete: boolean;
  onLetIn: () => void;
  onLink: () => void;
  onDelete: () => void;
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const dob = formatDob(a.dateOfBirth, lang);
  const working = busy !== null && busy.endsWith(a.id);
  return (
    <li className={cn(cardClass, "flex flex-wrap items-center gap-4 p-4")}>
      <div className="flex min-w-0 flex-1 basis-[220px] items-center gap-3">
        <Initials name={a.fullName} size={44} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold">{a.fullName}</div>
          <div className="break-words text-[13px] text-[var(--muted-foreground)]">
            {a.email ?? "—"}
            <UnconfirmedBadge confirmed={a.emailConfirmed} lang={lang} /> ·{" "}
            <span suppressHydrationWarning>
              {t("joined", "انضم")} {relativeJoined(a.createdAt, lang)}
            </span>
          </div>
          {dob ? (
            <div className="text-[13px] text-[var(--muted-foreground)]">
              {t("Born", "مواليد")} {dob}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={pill.primary} disabled={working} onClick={onLetIn}>
          {busy === `letin:${a.id}` ? <Spinner /> : null}
          {t("Let in", "اسمح بالدخول")}
        </button>
        <button type="button" className={pill.outline} disabled={working} onClick={onLink}>
          {t("Link to tree", "اربط بالشجرة")}
        </button>
        {canDelete ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-[var(--destructive)] hover:bg-[#FDECEA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--destructive)]"
            disabled={working}
            onClick={onDelete}
          >
            {t("Remove", "أزل")}
          </button>
        ) : null}
      </div>
    </li>
  );
}

// ── One suggested relative ────────────────────────────────────────────────────

function SuggestionCard({
  sg,
  lang,
  busy,
  onAdd,
  onAlready,
  onDismiss,
}: {
  sg: SuggestionRow;
  lang: Lang;
  busy: string | null;
  onAdd: () => void;
  onAlready: () => void;
  onDismiss: () => void;
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const working = busy !== null && busy.endsWith(sg.id);
  return (
    <li className={cn(cardClass, "flex flex-wrap items-center gap-4 p-4")}>
      <div className="min-w-0 flex-1 basis-[240px]">
        <div className="text-[15px] font-bold">{sg.name}</div>
        <div className="text-[13px] text-[#3D2B2E]">
          {t(`${sg.relation} of ${sg.suggestedBy.fullName}`, `${sg.relation} (${sg.suggestedBy.fullName})`)}
        </div>
        {sg.note ? <div className="mt-0.5 whitespace-pre-line break-words text-[13px] text-[var(--muted-foreground)]">{sg.note}</div> : null}
        <div className="mt-0.5 text-xs text-[var(--muted-foreground)]" suppressHydrationWarning>
          {t("Suggested", "اقتُرح")} {relativeJoined(sg.createdAt, lang)}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={pill.primary} disabled={working} onClick={onAdd}>
          {t("Add to tree", "أضف إلى الشجرة")}
        </button>
        <button type="button" className={pill.outline} disabled={working} onClick={onAlready}>
          {busy === `sg-in:${sg.id}` ? <Spinner /> : null}
          {t("Already in tree", "موجود في الشجرة")}
        </button>
        <button
          type="button"
          className={pill.ghost}
          disabled={working}
          aria-label={t(`Dismiss ${sg.name}`, `استبعد ${sg.name}`)}
          onClick={onDismiss}
        >
          {busy === `sg-no:${sg.id}` ? <Spinner /> : null}
          {t("Dismiss", "استبعد")}
        </button>
      </div>
    </li>
  );
}
