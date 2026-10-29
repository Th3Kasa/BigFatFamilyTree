"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { inviteMember } from "@/lib/actions/members";
import { confirmationMatches } from "@/lib/members/permissions";
import { ROLE_ORDER, roleLabel } from "@/lib/members/rules";
import type { MemberRole, PersonSummary } from "@/lib/members/types";
import { MIN_DOB } from "@/lib/validation/members";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PersonCombobox } from "./PersonCombobox";
import { cardClass, displayFont, fieldClass, pill, Spinner } from "./primitives";

type Lang = "ar" | "en";

// ── Invite a member (owner only) ─────────────────────────────────────────────

/**
 * Add someone by email. They get Supabase's invitation email, then land on
 * /welcome. Role, approval and the link to a person in the tree are set for them.
 */
export function InviteMemberForm({
  lang,
  people,
  onOpenRow,
}: {
  lang: Lang;
  people: PersonSummary[];
  /** "Open their row" when the email already has an account. */
  onOpenRow: (profileId: string, email: string) => void;
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const uid = useId();
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [role, setRole] = useState<MemberRole>("viewer");
  const [approveNow, setApproveNow] = useState(true);
  const [person, setPerson] = useState<PersonSummary | null>(null);
  const [comboKey, setComboKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const todayLocal = new Date().toLocaleDateString("en-CA");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExisting(null);
    setSentTo(null);
    if (fullName.trim().length < 2) {
      setError(t("Enter their full name.", "أدخل اسمه الكامل."));
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(t("Enter a valid email address.", "أدخل بريدًا إلكترونيًا صحيحًا."));
      return;
    }
    setBusy(true);
    try {
      const res = await inviteMember({
        fullName,
        email,
        dateOfBirth: dob || null,
        personId: person?.id ?? null,
        role,
        approveNow,
      });
      if (res.ok) {
        toast.success(res.message);
        setSentTo(email.trim().toLowerCase());
        setFullName("");
        setEmail("");
        setDob("");
        setRole("viewer");
        setApproveNow(true);
        setPerson(null);
        setComboKey((k) => k + 1);
        router.refresh();
      } else {
        setError(res.error);
        setExisting(res.existingProfileId ?? null);
      }
    } catch {
      setError(t("Something went wrong. Please try again.", "حدث خطأ ما. حاول مرة أخرى."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`${uid}-h`} className={cn(cardClass, "p-5")}>
      <h2 id={`${uid}-h`} className="text-lg font-bold">
        {t("Invite a member", "ادعُ عضوًا")}
      </h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        {t(
          "We email them an invitation. When they accept, they land on the welcome page with everything below already set.",
          "نرسل لهم دعوة بالبريد. عند القبول يصلون إلى صفحة الترحيب وكل ما يلي مضبوط مسبقًا.",
        )}
      </p>

      {sentTo ? (
        <p role="status" className="mt-3 rounded-2xl bg-[#E3EEDF] px-4 py-3 text-sm text-[#2F5A27]">
          {t(`Invitation sent to ${sentTo}.`, `أُرسلت الدعوة إلى ${sentTo}.`)}
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-5 flex max-w-2xl flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-name`} className="text-sm font-semibold">
              {t("Full name", "الاسم الكامل")}
            </label>
            <input
              id={`${uid}-name`}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
              autoComplete="off"
              disabled={busy}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-email`} className="text-sm font-semibold">
              {t("Email", "البريد الإلكتروني")}
            </label>
            <input
              id={`${uid}-email`}
              type="email"
              inputMode="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              disabled={busy}
              aria-invalid={existing ? true : undefined}
              className={cn(fieldClass, lang === "ar" && "text-end")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-dob`} className="text-sm font-semibold">
              {t("Date of birth (optional)", "تاريخ الميلاد (اختياري)")}
            </label>
            <input
              id={`${uid}-dob`}
              type="date"
              min={MIN_DOB}
              max={todayLocal}
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              disabled={busy}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-role`} className="text-sm font-semibold">
              {t("They can", "الصلاحية")}
            </label>
            <select
              id={`${uid}-role`}
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
              disabled={busy}
              className={cn(fieldClass, "appearance-auto")}
            >
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r, lang)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <PersonCombobox
          key={comboKey}
          people={people}
          lang={lang}
          label={t("Link to a person in the tree (optional)", "اربط بشخص في الشجرة (اختياري)")}
          placeholder={t("Type a name", "اكتب اسمًا")}
          value={person}
          onChange={setPerson}
          hint={t("Skip this if they aren't in the tree yet. You can link them later.", "تخطَّ هذا إن لم يكونوا في الشجرة بعد. يمكنك ربطهم لاحقًا.")}
        />

        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={approveNow}
            onChange={(e) => setApproveNow(e.target.checked)}
            disabled={busy}
            className="size-5 accent-[var(--primary)]"
          />
          {t("Approve now (they can see the tree as soon as they sign in)", "وافق الآن (يرون الشجرة فور تسجيل الدخول)")}
        </label>

        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#F6D3BC] bg-[#FFF4EC] px-4 py-3 text-sm font-medium text-[#9A3412]">
            <span className="min-w-0 flex-1">{error}</span>
            {existing ? (
              <button type="button" className={pill.outline} onClick={() => onOpenRow(existing, email.trim())}>
                {t("Open their row", "افتح صفّه")}
              </button>
            ) : null}
          </div>
        ) : null}

        <button type="submit" disabled={busy} className={cn(pill.primary, "self-start")}>
          {busy ? <Spinner /> : null}
          {t("Send invitation", "أرسل الدعوة")}
        </button>
      </form>
    </section>
  );
}

// ── Delete an account (owner only) ───────────────────────────────────────────

export type DeleteTarget = {
  id: string;
  /** The name they must type: full name (or the email's first part). */
  confirmName: string;
  /** For the sentence "X's place in the family tree stays". */
  treeName: string | null;
};

/** Destructive confirmation: type the member's name to enable "Delete account". */
export function DeleteMemberDialog({
  target,
  lang,
  onClose,
  onConfirm,
}: {
  target: DeleteTarget | null;
  lang: Lang;
  onClose: () => void;
  /** Resolves true when the account was deleted. */
  onConfirm: (target: DeleteTarget, typed: string) => Promise<boolean>;
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const uid = useId();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!target) return;
    setBusy(true);
    try {
      if (await onConfirm(target, typed)) {
        setTyped("");
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  const matches = target ? confirmationMatches(typed, target.confirmName) : false;
  const first = target?.treeName?.split(" ")[0];

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) {
          setTyped("");
          onClose();
        }
      }}
    >
      <DialogContent
        dir={lang === "ar" ? "rtl" : "ltr"}
        className="max-h-[90svh] max-w-md gap-4 overflow-y-auto rounded-[20px] border-[#ECE2DE] bg-[#FBF7F4]"
      >
        <DialogHeader className="text-start">
          <DialogTitle className="text-xl font-bold text-[var(--destructive)]" style={displayFont(lang)}>
            {t("Delete this account?", "حذف هذا الحساب؟")}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-[#3D2B2E]">
            {t(
              `This permanently deletes ${target?.confirmName ?? "this member"}'s account. They won't be able to sign in, and this can't be undone.`,
              `سيُحذف حساب ${target?.confirmName ?? "هذا العضو"} نهائيًا. لن يتمكن من تسجيل الدخول ولا يمكن التراجع.`,
            )}{" "}
            {target?.treeName
              ? t(
                  `${first ?? target.treeName}'s place in the family tree stays.`,
                  `يبقى مكان ${first ?? target.treeName} في شجرة العائلة.`,
                )
              : t("Anyone they were linked to in the tree stays.", "يبقى أي شخص كان مرتبطًا به في الشجرة.")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-confirm`} className="text-sm font-semibold">
            {t(`Type "${target?.confirmName ?? ""}" to confirm`, `اكتب «${target?.confirmName ?? ""}» للتأكيد`)}
          </label>
          <input
            id={`${uid}-confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
            disabled={busy}
            className={fieldClass}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2 sm:space-x-0">
          <button type="button" className={pill.ghost} onClick={onClose} disabled={busy}>
            {t("Cancel", "إلغاء")}
          </button>
          <button
            type="button"
            disabled={!matches || busy}
            onClick={confirm}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--destructive)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#8F1C13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--destructive)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? <Spinner /> : null}
            {t("Delete account", "احذف الحساب")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
