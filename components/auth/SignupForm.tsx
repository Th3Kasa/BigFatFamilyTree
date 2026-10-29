"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldClass, pill, Spinner } from "@/components/members/primitives";
import { DobSelect } from "@/components/auth/DobSelect";
import { PinField } from "@/components/auth/PinField";
import { checkFamilyPinAction, checkJoinFirstNameAction, pinJoinAction } from "@/lib/actions/pin";
import { familyPinSchema, firstIssueCode, pinJoinSchema, pinMessage, pinNameSchema } from "@/lib/auth/pin-validation";

type Lang = "ar" | "en";

// Re-render when the language switch changes <html lang> without a full reload.
function subscribeToLang(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  return () => observer.disconnect();
}

/** The page language set by the server (<html lang>), without a hydration mismatch. */
export function useDocumentLang(): Lang {
  return useSyncExternalStore<Lang>(
    subscribeToLang,
    () => (document.documentElement.lang === "ar" ? "ar" : "en"),
    () => "en",
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-2xl border border-[#F6D3BC] bg-[#FFF4EC] px-4 py-3 text-sm font-medium text-[#9A3412]">
      {message}
    </p>
  );
}

type Props = {
  lang: Lang;
  /** Called with where to go once the account is created and signed in. */
  onDone: (redirectTo: string) => void;
  onSignIn: () => void;
};

/**
 * "Join the family", one step at a time; each step slides in once the one
 * before it is done:
 *   1. the family PIN from the family group (checked on the server straight away);
 *   2. your first name;
 *   3. your birthday, ONLY when someone with that first name has already joined;
 *   4. your own 4-digit PIN, typed twice, then "Join the family".
 * Every step is re-checked on the server when the account is created. The
 * account waits for an admin's approval and is signed in straight away.
 */
export function SignupForm({ lang, onDone, onSignIn }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const uid = useId();
  const [familyPin, setFamilyPin] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [nameDone, setNameDone] = useState(false);
  const [needBirthday, setNeedBirthday] = useState(false);
  const [dob, setDob] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [busy, setBusy] = useState<null | "family" | "name" | "join">(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loading = busy !== null;
  const showPins = nameDone && (!needBirthday || dob !== "");

  /** The ticket ran out (or the family PIN was changed): start again at step 1, keeping the name. */
  function backToFamilyPin(message: string) {
    setTicket(null);
    setFamilyPin("");
    setNameDone(false);
    setErrorMsg(message);
  }

  async function checkFamilyPin(value: string) {
    setErrorMsg(null);
    const parsed = familyPinSchema.safeParse(value);
    if (!parsed.success) {
      setErrorMsg(pinMessage(firstIssueCode(parsed.error), lang));
      return;
    }
    setBusy("family");
    try {
      const res = await checkFamilyPinAction(value);
      if (res.ok) setTicket(res.ticket);
      else {
        setErrorMsg(res.error);
        setFamilyPin("");
      }
    } catch {
      setErrorMsg(pinMessage("failed", lang));
    }
    setBusy(null);
  }

  function onFamilyPinChange(value: string) {
    setFamilyPin(value);
    // Six digits is a whole family PIN: check it without making anyone hunt for a button.
    if (value.length === 6 && !loading) void checkFamilyPin(value);
  }

  async function checkName() {
    setErrorMsg(null);
    const parsed = pinNameSchema.safeParse(firstName);
    if (!parsed.success) {
      setErrorMsg(pinMessage(firstIssueCode(parsed.error), lang));
      return;
    }
    if (!ticket) return;
    setBusy("name");
    try {
      const res = await checkJoinFirstNameAction({ ticket, firstName });
      if (res.ok) {
        setNeedBirthday(res.needBirthday);
        setNameDone(true);
      } else if (res.code === "join_expired") backToFamilyPin(res.error);
      else setErrorMsg(res.error);
    } catch {
      setErrorMsg(pinMessage("failed", lang));
    }
    setBusy(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!ticket) return void checkFamilyPin(familyPin);
    if (!nameDone) return void checkName();
    if (!showPins) return;
    setErrorMsg(null);
    const input = { ticket, firstName, dateOfBirth: needBirthday ? dob : "", pin, pinConfirm };
    const parsed = pinJoinSchema.safeParse(input);
    if (!parsed.success) {
      setErrorMsg(pinMessage(firstIssueCode(parsed.error), lang));
      return;
    }
    setBusy("join");
    try {
      const res = await pinJoinAction(input);
      if (res.ok) {
        onDone(res.redirectTo);
        return;
      }
      if (res.code === "join_expired") backToFamilyPin(res.error);
      else {
        // Someone with this first name joined in the meantime: the birthday step slides in.
        if (res.code === "join_need_birthday") setNeedBirthday(true);
        setErrorMsg(res.error);
      }
    } catch {
      setErrorMsg(pinMessage("failed", lang));
    }
    setBusy(null);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {/* 1. Family PIN */}
      <PinField
        lang={lang}
        name="family-pin"
        label={t("Family PIN", "رمز العائلة")}
        hint={ticket ? undefined : t("6 digits. Find it in the family group.", "٦ أرقام. ستجده في مجموعة العائلة.")}
        length={6}
        autoComplete="off"
        value={familyPin}
        onChange={onFamilyPinChange}
        disabled={loading || ticket !== null}
      />
      {ticket ? (
        <p className="step-in -mt-2 flex items-center gap-1.5 text-sm font-semibold text-[#2F6B3A]">
          <Check aria-hidden="true" className="size-4" />
          {t("Family PIN accepted", "تم قبول رمز العائلة")}
        </p>
      ) : null}
      {busy === "family" ? (
        <p className="flex items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
          <Spinner />
          {t("Checking…", "جارٍ التحقق…")}
        </p>
      ) : null}

      {/* 2. First name */}
      {ticket ? (
        <div className="step-in flex flex-col gap-1.5">
          <label htmlFor={`${uid}-first`} className="text-sm font-semibold">
            {t("Your first name", "اسمك الأول")}
          </label>
          <input
            id={`${uid}-first`}
            name="given-name"
            type="text"
            autoComplete="given-name"
            autoFocus
            required
            maxLength={60}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={loading}
            placeholder={t("e.g. Adel", "مثال: عادل")}
            className={fieldClass}
          />
        </div>
      ) : null}

      {/* 3. Birthday, only when someone with this first name has already joined */}
      {nameDone && needBirthday ? (
        <div className="step-in flex flex-col gap-2">
          <p className="rounded-2xl bg-[var(--muted)] px-4 py-3 text-sm">{pinMessage("join_need_birthday", lang)}</p>
          <DobSelect lang={lang} value={dob} onChange={setDob} disabled={loading} />
        </div>
      ) : null}

      {/* 4. Your own PIN, twice */}
      {showPins ? (
        <div className="step-in flex flex-col gap-4">
          <PinField
            lang={lang}
            name="new-pin"
            label={t("Choose your own 4-digit PIN", "اختر رمزك السري الخاص (٤ أرقام)")}
            hint={t("You'll use it to sign in. Avoid 1234 or 1111.", "ستستخدمه لتسجيل الدخول. تجنّب 1234 أو 1111.")}
            length={4}
            autoComplete="new-password"
            value={pin}
            onChange={setPin}
            disabled={loading}
            autoFocus={!needBirthday}
          />
          <PinField
            lang={lang}
            name="new-pin-confirm"
            label={t("Type your PIN again", "أعد كتابة رمزك السري")}
            length={4}
            autoComplete="new-password"
            value={pinConfirm}
            onChange={setPinConfirm}
            disabled={loading}
          />
        </div>
      ) : null}

      <ErrorNote message={errorMsg} />

      {ticket && !nameDone ? (
        <button type="submit" disabled={loading} className={cn(pill.primary, "step-in min-h-[52px] text-base")}>
          {busy === "name" ? <Spinner /> : null}
          {t("Next", "التالي")}
        </button>
      ) : null}
      {showPins ? (
        <button type="submit" disabled={loading} className={cn(pill.primary, "step-in min-h-[52px] text-base")}>
          {busy === "join" ? <Spinner /> : null}
          {busy === "join" ? t("Joining…", "جارٍ الانضمام…") : t("Join the family", "انضم إلى العائلة")}
        </button>
      ) : null}

      <p className="text-center text-sm text-[var(--muted-foreground)]">
        {t("Already have an account?", "لديك حساب بالفعل؟")}{" "}
        <button
          type="button"
          onClick={onSignIn}
          className="inline-flex min-h-11 items-center px-1 font-semibold text-[var(--primary)] underline-offset-4 hover:underline"
        >
          {t("Sign in", "تسجيل الدخول")}
        </button>
      </p>
    </form>
  );
}
