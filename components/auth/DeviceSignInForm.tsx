"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { pill, Spinner } from "@/components/members/primitives";
import { PinField } from "@/components/auth/PinField";
import { ErrorNote } from "@/components/auth/SignupForm";
import { forgetThisDeviceAction, pinDeviceSignInAction } from "@/lib/actions/pin";
import { firstIssueCode, pinMessage, pinSchema } from "@/lib/auth/pin-validation";

export type RememberedMember = { firstName: string; initials: string };

type Props = {
  lang: "ar" | "en";
  member: RememberedMember;
  onDone: () => void;
  /** Show the full name + birthday + PIN form instead (after "Not you?" or an unknown device). */
  onUseFullForm: () => void;
  onAdminEmail: () => void;
};

/**
 * A returning device: the server already knows who this is (httpOnly cookie),
 * so only the PIN is asked. The browser never holds the name or birthday here
 * beyond what the server rendered (first name + initials).
 */
export function DeviceSignInForm({ lang, member, onDone, onUseFullForm, onAdminEmail }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const parsed = pinSchema.safeParse(pin);
    if (!parsed.success) {
      setErrorMsg(pinMessage(firstIssueCode(parsed.error), lang));
      return;
    }
    setLoading(true);
    try {
      const res = await pinDeviceSignInAction(pin);
      if (res.ok) {
        onDone();
        return;
      }
      if (res.code === "device_unknown") {
        // Revoked, expired or unknown token: the server already cleared the cookie.
        onUseFullForm();
        return;
      }
      setErrorMsg(res.error);
    } catch {
      setErrorMsg(pinMessage("failed", lang));
    }
    setPin("");
    setLoading(false);
  }

  async function notYou() {
    setLoading(true);
    try {
      await forgetThisDeviceAction();
    } catch {
      /* the full form works either way; a leftover cookie is cleared on the next visit */
    }
    onUseFullForm();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-16 items-center justify-center rounded-full bg-[#F7E7EB] text-xl font-bold text-[#7A1631]"
        >
          {member.initials}
        </span>
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("Signing in as", "تسجيل الدخول باسم")} <strong className="text-[var(--foreground)]">{member.firstName}</strong>
        </p>
      </div>

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

      <button type="submit" disabled={loading} className={cn(pill.primary, "min-h-[52px] text-base")}>
        {loading ? <Spinner /> : null}
        {loading ? t("Signing in…", "جارٍ تسجيل الدخول…") : t("Sign in", "تسجيل الدخول")}
      </button>

      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={notYou}
          disabled={loading}
          className="inline-flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-semibold text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-60"
        >
          {t("Not you?", "لست أنت؟")}
        </button>
        <p className="text-center text-xs text-[var(--muted-foreground)]">
          {t("Forgot your PIN? Ask a family admin to reset it.", "نسيت رمزك؟ اطلب من مشرف العائلة إعادة تعيينه.")}
        </p>
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
