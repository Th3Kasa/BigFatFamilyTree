"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldClass, pill, Spinner } from "@/components/members/primitives";
import { MIN_DOB } from "@/lib/validation/members";

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

type Props = {
  lang: Lang;
  fullName: string;
  onFullName: (v: string) => void;
  dob: string;
  onDob: (v: string) => void;
  email: string;
  onEmail: (v: string) => void;
  password: string;
  onPassword: (v: string) => void;
  loading: boolean;
  errorMsg: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onMagicLink: () => void;
  onSignIn: () => void;
};

/**
 * Sign-up: one column, big inputs, four fields. A magic link is offered as the
 * no-password alternative. Name + date of birth travel with the sign-up (see
 * handle_new_user) so /welcome can pre-fill the "find yourself" search.
 */
export function SignupForm({
  lang,
  fullName,
  onFullName,
  dob,
  onDob,
  email,
  onEmail,
  password,
  onPassword,
  loading,
  errorMsg,
  onSubmit,
  onMagicLink,
  onSignIn,
}: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const uid = useId();
  const [showPassword, setShowPassword] = useState(false);
  const todayLocal = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, viewer's timezone

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-name`} className="text-sm font-semibold">
          {t("Full name", "الاسم الكامل")}
        </label>
        <input
          id={`${uid}-name`}
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={120}
          value={fullName}
          onChange={(e) => onFullName(e.target.value)}
          disabled={loading}
          placeholder={t("e.g. Basem Morkos", "مثال: باسم مرقس")}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-dob`} className="text-sm font-semibold">
          {t("Date of birth", "تاريخ الميلاد")}
        </label>
        <input
          id={`${uid}-dob`}
          name="bday"
          type="date"
          autoComplete="bday"
          required
          min={MIN_DOB}
          max={todayLocal}
          value={dob}
          onChange={(e) => onDob(e.target.value)}
          disabled={loading}
          aria-describedby={`${uid}-dob-hint`}
          className={fieldClass}
        />
        <p id={`${uid}-dob-hint`} className="text-xs text-[var(--muted-foreground)]">
          {t(
            "Only used to match you with the right person in the family tree.",
            "نستخدمه فقط لمطابقتك مع الشخص الصحيح في شجرة العائلة.",
          )}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-email`} className="text-sm font-semibold">
          {t("Email", "البريد الإلكتروني")}
        </label>
        <input
          id={`${uid}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          dir="ltr"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          disabled={loading}
          placeholder="name@example.com"
          className={cn(fieldClass, lang === "ar" && "text-end")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-password`} className="text-sm font-semibold">
          {t("Password", "كلمة المرور")}
        </label>
        <div className="relative">
          <input
            id={`${uid}-password`}
            name="new-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            dir="ltr"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            disabled={loading}
            aria-describedby={`${uid}-pw-hint`}
            className={cn(fieldClass, "pe-14")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t("Hide password", "إخفاء كلمة المرور") : t("Show password", "إظهار كلمة المرور")}
            aria-pressed={showPassword}
            className="absolute end-1.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-white hover:text-[#241517] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            {showPassword ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
          </button>
        </div>
        <p id={`${uid}-pw-hint`} className="text-xs text-[var(--muted-foreground)]">
          {t("At least 8 characters.", "٨ أحرف على الأقل.")}
        </p>
      </div>

      {errorMsg ? (
        <p role="alert" className="rounded-2xl border border-[#F6D3BC] bg-[#FFF4EC] px-4 py-3 text-sm font-medium text-[#9A3412]">
          {errorMsg}
        </p>
      ) : null}

      <button type="submit" disabled={loading} className={cn(pill.primary, "min-h-[52px] text-base")}>
        {loading ? <Spinner /> : null}
        {loading ? t("Creating account…", "جارٍ إنشاء الحساب…") : t("Create account", "أنشئ حسابًا")}
      </button>

      <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]" aria-hidden="true">
        <span className="h-px flex-1 bg-[#ECE2DE]" />
        {t("or", "أو")}
        <span className="h-px flex-1 bg-[#ECE2DE]" />
      </div>

      <button type="button" onClick={onMagicLink} disabled={loading} className={cn(pill.outline, "min-h-[52px] text-base")}>
        {t("Sign up with a magic link", "سجّل برابط سحري")}
      </button>
      <p className="-mt-2 text-center text-xs text-[var(--muted-foreground)]">
        {t("No password needed. We email you a link to sign in.", "لا حاجة لكلمة مرور. نرسل لك رابط الدخول بالبريد.")}
      </p>

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
