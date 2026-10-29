"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { pill, Spinner } from "@/components/members/primitives";
import { IdentityFields, type Identity } from "@/components/auth/IdentityFields";
import { PinField } from "@/components/auth/PinField";
import { ErrorNote } from "@/components/auth/SignupForm";
import { pinSignInAction } from "@/lib/actions/pin";
import { firstIssueCode, pinMessage, pinSignInSchema } from "@/lib/auth/pin-validation";

type Props = {
  lang: "ar" | "en";
  /** Called with "/" once signed in; the page adds any ?next= it was given. */
  onDone: () => void;
  onAdminEmail: () => void;
};

/** The family sign-in on a new device: first name and your own 4-digit PIN (birthday and last name only when asked). */
export function PinSignInForm({ lang, onDone, onAdminEmail }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [who, setWho] = useState<Identity>({ firstName: "", lastName: "", dob: "" });
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Sign-in starts with first name + PIN; the birthday / last name appear only when asked for.
  const [showDob, setShowDob] = useState(false);
  const [showLast, setShowLast] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const input = {
      firstName: who.firstName,
      lastName: showLast ? who.lastName : "",
      dateOfBirth: showDob ? who.dob : "",
      pin,
    };
    const parsed = pinSignInSchema.safeParse(input);
    if (!parsed.success) {
      setErrorMsg(pinMessage(firstIssueCode(parsed.error), lang));
      return;
    }
    setLoading(true);
    try {
      const res = await pinSignInAction(input);
      if (res.ok) {
        onDone();
        return;
      }
      if (res.code === "need_birthday") setShowDob(true);
      if (res.code === "need_last_name") {
        setShowDob(true);
        setShowLast(true);
      }
      setErrorMsg(res.error);
    } catch {
      setErrorMsg(pinMessage("failed", lang));
    }
    setPin("");
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <IdentityFields lang={lang} value={who} onChange={setWho} disabled={loading} show={{ lastName: showLast, dob: showDob }} />
      <PinField
        lang={lang}
        name="password"
        label={t("Your 4-digit PIN", "رمزك السري (٤ أرقام)")}
        length={4}
        autoComplete="current-password"
        value={pin}
        onChange={setPin}
        disabled={loading}
      />

      <ErrorNote message={errorMsg} />

      {!showDob ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowDob(true)}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-semibold text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            {t("Not working? Add your birthday", "لا يعمل؟ أضف تاريخ ميلادك")}
          </button>
        </div>
      ) : null}

      <button type="submit" disabled={loading} className={cn(pill.primary, "min-h-[52px] text-base")}>
        {loading ? <Spinner /> : null}
        {loading ? t("Signing in…", "جارٍ تسجيل الدخول…") : t("Sign in", "تسجيل الدخول")}
      </button>

      <p className="text-center text-xs text-[var(--muted-foreground)]">
        {t("Forgot your PIN? Ask a family admin to reset it.", "نسيت رمزك؟ اطلب من مشرف العائلة إعادة تعيينه.")}
      </p>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onAdminEmail}
          className="inline-flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-semibold text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        >
          {t("Admins: sign in with email", "للمشرفين: سجّل الدخول بالبريد")}
        </button>
      </div>
    </form>
  );
}
