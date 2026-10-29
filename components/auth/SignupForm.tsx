"use client";

import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { pill, Spinner } from "@/components/members/primitives";
import { IdentityFields, type Identity } from "@/components/auth/IdentityFields";
import { PinField } from "@/components/auth/PinField";
import { pinJoinAction } from "@/lib/actions/pin";
import { firstIssueCode, pinJoinSchema, pinMessage } from "@/lib/auth/pin-validation";

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
 * "Join the family": first name, last name, date of birth, the family PIN the
 * owner shares in the group, and your own 4-digit PIN typed twice. No email.
 * The account is created waiting for approval and signed in straight away.
 */
export function SignupForm({ lang, onDone, onSignIn }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [who, setWho] = useState<Identity>({ firstName: "", lastName: "", dob: "" });
  const [familyPin, setFamilyPin] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const input = {
      firstName: who.firstName,
      lastName: who.lastName,
      dateOfBirth: who.dob,
      familyPin,
      pin,
      pinConfirm,
    };
    const parsed = pinJoinSchema.safeParse(input);
    if (!parsed.success) {
      setErrorMsg(pinMessage(firstIssueCode(parsed.error), lang));
      return;
    }
    setLoading(true);
    try {
      const res = await pinJoinAction(input);
      if (res.ok) {
        onDone(res.redirectTo);
        return;
      }
      setErrorMsg(res.error);
    } catch {
      setErrorMsg(pinMessage("failed", lang));
    }
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <IdentityFields
        lang={lang}
        value={who}
        onChange={setWho}
        disabled={loading}
        dobHint={t(
          "Used with your name to sign you in, and to match you with the right person in the family tree.",
          "نستخدمه مع اسمك لتسجيل دخولك ولمطابقتك مع الشخص الصحيح في شجرة العائلة.",
        )}
      />

      <PinField
        lang={lang}
        name="family-pin"
        label={t("Family PIN", "رمز العائلة")}
        hint={t("6 digits. Find it in the family group.", "٦ أرقام. ستجده في مجموعة العائلة.")}
        length={6}
        autoComplete="off"
        value={familyPin}
        onChange={setFamilyPin}
        disabled={loading}
      />

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

      <ErrorNote message={errorMsg} />

      <button type="submit" disabled={loading} className={cn(pill.primary, "min-h-[52px] text-base")}>
        {loading ? <Spinner /> : null}
        {loading ? t("Joining…", "جارٍ الانضمام…") : t("Join the family", "انضم إلى العائلة")}
      </button>

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
