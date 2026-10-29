"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Eye, EyeOff, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { magicLinkSchema } from "@/lib/validation/auth";
import { signUpProfileSchema } from "@/lib/validation/members";
import { safeNextPath } from "@/lib/auth/safe-next";
import { SignupForm, useDocumentLang } from "@/components/auth/SignupForm";
import { LanguageToggle } from "@/components/shell/LanguageToggle";
import { cardClass, fieldClass, pill, Spinner } from "@/components/members/primitives";
import { ensureBootstrapUser, signInBootstrapAdmin } from "./actions";
import { cn } from "@/lib/utils";

type Lang = "ar" | "en";
type Screen = "signin" | "magic" | "signup" | "forgot" | "sent-magic" | "sent-signup" | "sent-reset";

const RESEND_COOLDOWN_SECONDS = 60;

/* ─── resend countdown ───────────────────────────────────────── */
// Starts at `seconds` whenever `runKey` changes (entering a "check your email"
// screen, or sending again) and ticks down to 0.
function useCountdown(seconds: number, runKey: string | null) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (runKey === null) return;
    setRemaining(seconds);
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [runKey, seconds]);

  return remaining;
}

/* ─── friendly errors ────────────────────────────────────────── */

// Supabase's mailer allows only a few emails per hour for the whole project;
// turn its raw error into something a family member understands.
function friendlyAuthError(error: { message: string; status?: number }, lang: Lang = "en"): string {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  if (error.status === 429 || /rate limit/i.test(error.message)) {
    return t(
      "Too many emails were sent just now. Please wait a few minutes and try again.",
      "تم إرسال عدد كبير من الرسائل الآن. انتظر بضع دقائق ثم حاول مرة أخرى.",
    );
  }
  if (/invalid login credentials/i.test(error.message)) {
    return t(
      "That email and password don't match. Check them, or use a magic link instead.",
      "البريد وكلمة المرور غير متطابقين. تحقق منهما أو استخدم رابطًا سحريًا.",
    );
  }
  if (/email not confirmed/i.test(error.message)) {
    return t(
      "Please confirm your email first. We sent you a link when you signed up.",
      "يرجى تأكيد بريدك أولًا. أرسلنا لك رابطًا عند التسجيل.",
    );
  }
  return error.message;
}

// Sign-up is the one flow used by the whole family (often on phones, often in
// Arabic), so its errors are plain-language and bilingual. Anything unexpected
// falls through to friendlyAuthError.
function friendlySignupError(error: { message: string; status?: number }, lang: Lang): string {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const msg = error.message;
  if (/already (registered|been registered)|already exists/i.test(msg)) {
    return t(
      "There's already an account with this email. Try signing in instead.",
      "يوجد حساب بهذا البريد بالفعل. جرّب تسجيل الدخول.",
    );
  }
  if (/password/i.test(msg) && /(weak|short|least|characters)/i.test(msg)) {
    return t("Choose a longer, harder-to-guess password.", "اختر كلمة مرور أطول وأصعب في التخمين.");
  }
  if (/signups? (are )?(not allowed|disabled)/i.test(msg)) {
    return t("Sign-ups are closed right now. Please ask a family admin.", "التسجيل مغلق حاليًا. اسأل مشرف العائلة.");
  }
  return friendlyAuthError(error, lang);
}

// Where to land after signing in: the ?next= the middleware adds when it
// bounces a signed-out visitor (e.g. /welcome). Only same-site paths survive
// safeNextPath(); anything else becomes "/". Called from event handlers only,
// so reading window is safe.
function nextFromUrl(): string {
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}

/* ─── small pieces ───────────────────────────────────────────── */

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[var(--foreground)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-2xl border border-[#F6D3BC] bg-[#FFF4EC] px-4 py-3 text-sm font-medium text-[#9A3412]">
      {message}
    </p>
  );
}

function LinkButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-semibold text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
    >
      {children}
    </button>
  );
}

/* ─── main page ──────────────────────────────────────────────── */

export default function LoginPage() {
  const lang = useDocumentLang();
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const uid = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  // Where a magic link should land after sign-in ("/welcome" for new sign-ups).
  const [afterAuth, setAfterAuth] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("signin");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resendTick, setResendTick] = useState(0);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const tabRefs = useRef<Record<"signin" | "signup", HTMLButtonElement | null>>({ signin: null, signup: null });

  // "Join the family" on the landing page opens the sign-up tab: /login?mode=signup
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "signup") setScreen("signup");
  }, []);

  const sent = screen === "sent-magic" || screen === "sent-signup" || screen === "sent-reset";
  const remaining = useCountdown(RESEND_COOLDOWN_SECONDS, sent ? `${screen}:${resendTick}` : null);
  const canResend = remaining === 0;

  function goTo(s: Screen) {
    setScreen(s);
    setErrorMsg(null);
    setResendNote(null);
    if (s !== "sent-magic") setAfterAuth(null);
  }

  const activeTab: "signin" | "signup" | null =
    screen === "signup" ? "signup" : screen === "signin" || screen === "magic" ? "signin" : null;

  function onTabKey(e: React.KeyboardEvent, current: "signin" | "signup") {
    const order: Array<"signin" | "signup"> = lang === "ar" ? ["signup", "signin"] : ["signin", "signup"];
    const idx = order.indexOf(current);
    let next: "signin" | "signup" | null = null;
    if (e.key === "ArrowRight") next = order[(idx + (lang === "ar" ? -1 : 1) + 2) % 2];
    else if (e.key === "ArrowLeft") next = order[(idx + (lang === "ar" ? 1 : -1) + 2) % 2];
    else if (e.key === "Home") next = order[0];
    else if (e.key === "End") next = order[1];
    if (!next) return;
    e.preventDefault();
    goTo(next);
    tabRefs.current[next]?.focus();
  }

  /* ── sign in with a password ── */
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const parsed = magicLinkSchema.safeParse({ email });
    if (!parsed.success) {
      setErrorMsg(t("Enter a valid email address.", "أدخل بريدًا إلكترونيًا صحيحًا."));
      return;
    }
    if (!password) {
      setErrorMsg(t("Enter your password.", "أدخل كلمة المرور."));
      return;
    }
    setLoading(true);
    const supabase = createClient();

    // Path 1: bootstrap-admin login (works even if Supabase's email/password
    // provider is disabled: we verify the password server-side and exchange
    // a service-role-minted magic-link token for a session).
    const adminAttempt = await signInBootstrapAdmin(parsed.data.email, password);
    if (adminAttempt.ok) {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        token_hash: adminAttempt.tokenHash,
        type: "magiclink",
      });
      setLoading(false);
      if (verifyErr) {
        setErrorMsg(friendlyAuthError(verifyErr, lang));
        return;
      }
      window.location.href = nextFromUrl();
      return;
    }

    // Path 2: regular Supabase password sign-in (works when the provider is
    // enabled in the project settings).
    const bootstrapResult = await ensureBootstrapUser(parsed.data.email);
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password,
    });
    setLoading(false);
    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.debug("[login] bootstrap:", bootstrapResult, "admin attempt:", adminAttempt);
      }
      setErrorMsg(friendlyAuthError(error, lang));
      return;
    }
    window.location.href = nextFromUrl();
  }

  /* ── magic link ── */
  async function sendMagicLink(): Promise<string | null> {
    const parsed = magicLinkSchema.safeParse({ email });
    if (!parsed.success) return t("Enter a valid email address.", "أدخل بريدًا إلكترونيًا صحيحًا.");
    await ensureBootstrapUser(parsed.data.email);
    const supabase = createClient();
    // A resend after a magic-link sign-up keeps going to /welcome; a normal
    // sign-in returns to wherever the visitor was headed.
    const next = afterAuth ?? nextFromUrl();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback${
          next !== "/" ? `?next=${encodeURIComponent(next)}` : ""
        }`,
      },
    });
    return error ? friendlyAuthError(error, lang) : null;
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    const err = await sendMagicLink();
    setLoading(false);
    if (err) {
      setErrorMsg(err);
      return;
    }
    goTo("sent-magic");
  }

  /* ── sign up ── */
  // Validate the three things both sign-up routes need (name, date of birth,
  // email). Returns the clean values, or null after showing the first problem.
  function validateSignupBasics() {
    const profile = signUpProfileSchema.safeParse({ fullName, dateOfBirth: dob });
    if (!profile.success) {
      const issue = profile.error.issues[0];
      const field = issue?.path[0];
      setErrorMsg(
        field === "dateOfBirth"
          ? dob && dob > new Date().toLocaleDateString("en-CA")
            ? t("Date of birth can't be in the future.", "لا يمكن أن يكون تاريخ الميلاد في المستقبل.")
            : t("Enter your date of birth.", "أدخل تاريخ ميلادك.")
          : t("Enter your full name.", "أدخل اسمك الكامل."),
      );
      return null;
    }
    const emailOk = magicLinkSchema.safeParse({ email });
    if (!emailOk.success) {
      setErrorMsg(t("Enter a valid email address.", "أدخل بريدًا إلكترونيًا صحيحًا."));
      return null;
    }
    return {
      email: emailOk.data.email,
      data: { full_name: profile.data.fullName, date_of_birth: profile.data.dateOfBirth },
    };
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const basics = validateSignupBasics();
    if (!basics) return;
    if (password.length < 8) {
      setErrorMsg(t("Password must be at least 8 characters.", "يجب ألا تقل كلمة المرور عن ٨ أحرف."));
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: basics.email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/welcome`,
        data: basics.data,
      },
    });
    if (error) {
      setLoading(false);
      setErrorMsg(friendlySignupError(error, lang));
      return;
    }
    // Supabase hides "already registered" by returning a user with no identities.
    if (data.user && data.user.identities?.length === 0) {
      setLoading(false);
      setErrorMsg(
        t(
          "There's already an account with this email. Try signing in instead.",
          "يوجد حساب بهذا البريد بالفعل. جرّب تسجيل الدخول.",
        ),
      );
      return;
    }
    // Email confirmation off: we already have a session, go straight to /welcome.
    if (data.session) {
      window.location.href = "/welcome";
      return;
    }
    setLoading(false);
    goTo("sent-signup");
  }

  async function handleSignUpMagicLink() {
    setErrorMsg(null);
    const basics = validateSignupBasics();
    if (!basics) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: basics.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/welcome`,
        data: basics.data,
      },
    });
    setLoading(false);
    if (error) {
      setErrorMsg(friendlySignupError(error, lang));
      return;
    }
    setAfterAuth("/welcome");
    goTo("sent-magic");
  }

  /* ── forgot password ── */
  async function sendReset(): Promise<string | null> {
    const parsed = magicLinkSchema.safeParse({ email });
    if (!parsed.success) return t("Enter a valid email address.", "أدخل بريدًا إلكترونيًا صحيحًا.");
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
    });
    return error ? friendlyAuthError(error, lang) : null;
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    const err = await sendReset();
    setLoading(false);
    if (err) {
      setErrorMsg(err);
      return;
    }
    goTo("sent-reset");
  }

  /* ── resend from a "check your email" screen ── */
  async function handleResend() {
    if (!canResend || loading) return;
    setErrorMsg(null);
    setResendNote(null);
    setLoading(true);
    let err: string | null;
    if (screen === "sent-signup") {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/welcome` },
      });
      err = error ? friendlySignupError(error, lang) : null;
    } else if (screen === "sent-reset") {
      err = await sendReset();
    } else {
      err = await sendMagicLink();
    }
    setLoading(false);
    if (err) {
      setErrorMsg(err);
      return;
    }
    setResendNote(t("Sent again. Check your inbox.", "أُرسلت مرة أخرى. تحقق من بريدك."));
    setResendTick((n) => n + 1);
  }

  /* ── render ── */
  const heading =
    screen === "signup"
      ? t("Join the family", "انضم إلى العائلة")
      : screen === "forgot"
        ? t("Forgot your password?", "نسيت كلمة المرور؟")
        : screen === "magic"
          ? t("Sign in with a magic link", "الدخول برابط سحري")
          : sent
            ? t("Check your email", "تحقق من بريدك")
            : t("Welcome back", "أهلًا بعودتك");

  const subheading =
    screen === "signup"
      ? t("Four quick details, then we'll help you find your place in the family tree.", "أربع خانات صغيرة، ثم نساعدك على إيجاد مكانك في شجرة العائلة.")
      : screen === "forgot"
        ? t("Enter your email and we'll send you a reset link.", "أدخل بريدك وسنرسل لك رابط إعادة التعيين.")
        : screen === "magic"
          ? t("Enter your email and we'll send you a link. No password needed.", "أدخل بريدك وسنرسل لك رابطًا. لا حاجة لكلمة مرور.")
          : sent
            ? null
            : t("Sign in to see the family tree.", "سجّل الدخول لترى شجرة العائلة.");

  const sentCopy =
    screen === "sent-signup"
      ? t("We sent a link to confirm your account to", "أرسلنا رابط تأكيد حسابك إلى")
      : screen === "sent-reset"
        ? t("We sent a password reset link to", "أرسلنا رابط إعادة تعيين كلمة المرور إلى")
        : t("We sent a sign-in link to", "أرسلنا رابط تسجيل الدخول إلى");

  return (
    <div className="flex min-h-dvh flex-col items-center bg-[var(--background)] px-4 pb-10 pt-4 sm:pt-6">
      <div className="flex w-full max-w-[420px] justify-end">
        <LanguageToggle lang={lang} />
      </div>

      <main id="main" className={cn(cardClass, "mt-4 w-full max-w-[420px] p-5 shadow-[var(--shadow-floating)] sm:mt-8 sm:p-8")}>
        <div className="flex justify-center">
          <Image
            src="/logo.png"
            alt="Big Fat Family"
            width={1200}
            height={411}
            priority
            sizes="180px"
            className="h-auto w-[180px]"
          />
        </div>

        {/* ── tabs: Sign in | Join the family ── */}
        {activeTab ? (
          <div
            role="tablist"
            aria-label={t("Sign in or join", "تسجيل الدخول أو الانضمام")}
            className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-[var(--muted)] p-1"
          >
            {(["signin", "signup"] as const).map((key) => (
              <button
                key={key}
                ref={(el) => {
                  tabRefs.current[key] = el;
                }}
                type="button"
                role="tab"
                id={`${uid}-tab-${key}`}
                aria-selected={activeTab === key}
                aria-controls={`${uid}-panel`}
                tabIndex={activeTab === key ? 0 : -1}
                onClick={() => goTo(key)}
                onKeyDown={(e) => onTabKey(e, key)}
                className={cn(
                  "min-h-11 rounded-full px-3 text-sm font-semibold text-[var(--foreground)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
                  activeTab === key ? "bg-white shadow-[0_1px_3px_rgba(36,21,23,0.12)]" : "text-[var(--muted-foreground)] hover:bg-white/60",
                )}
              >
                {key === "signin" ? t("Sign in", "تسجيل الدخول") : t("Join the family", "انضم إلى العائلة")}
              </button>
            ))}
          </div>
        ) : null}

        <div
          id={`${uid}-panel`}
          role={activeTab ? "tabpanel" : undefined}
          aria-labelledby={activeTab ? `${uid}-tab-${activeTab}` : undefined}
          className="mt-6"
        >
          {sent ? (
            <div className="flex flex-col items-center text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
                <Mail aria-hidden="true" className="size-8" strokeWidth={1.6} />
              </span>
              <h1 className="font-heading mt-4 text-[26px] font-bold leading-tight">{heading}</h1>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                {sentCopy}{" "}
                <strong dir="ltr" className="break-all font-semibold text-[var(--foreground)]">
                  {email.trim()}
                </strong>
                .
              </p>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                {screen === "sent-signup"
                  ? t(
                      "Once confirmed, we'll help you find your place in the family tree. Not there? Check your spam folder.",
                      "بعد التأكيد سنساعدك على إيجاد مكانك في شجرة العائلة. لم تصلك؟ تحقق من البريد المزعج.",
                    )
                  : t("Not there? Check your spam folder.", "لم تصلك؟ تحقق من البريد المزعج.")}
              </p>

              <div className="mt-5 flex w-full flex-col gap-2" aria-live="polite">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={!canResend || loading}
                  className={cn(pill.outline, "min-h-[52px] w-full text-base")}
                >
                  {loading ? <Spinner /> : null}
                  {canResend
                    ? t("Resend email", "أعد إرسال الرسالة")
                    : t(`Resend in ${remaining}s`, `أعد الإرسال بعد ${remaining} ث`)}
                </button>
                {resendNote ? (
                  <p role="status" className="text-sm font-medium text-[#2F5A27]">
                    {resendNote}
                  </p>
                ) : null}
                <ErrorBox message={errorMsg} />
              </div>

              <div className="mt-2 flex flex-wrap justify-center gap-x-2">
                <LinkButton onClick={() => goTo(screen === "sent-signup" ? "signup" : screen === "sent-reset" ? "forgot" : "magic")}>
                  {t("Wrong email? Change it", "بريد خاطئ؟ غيّره")}
                </LinkButton>
                <LinkButton onClick={() => goTo("signin")}>{t("Back to sign in", "العودة لتسجيل الدخول")}</LinkButton>
              </div>
            </div>
          ) : (
            <>
              <h1 className="font-heading text-[26px] font-bold leading-tight">{heading}</h1>
              {subheading ? (
                <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--muted-foreground)]">{subheading}</p>
              ) : null}

              <div className="mt-5">
                {/* ── sign in (password) ── */}
                {screen === "signin" && (
                  <form onSubmit={handleSignIn} className="flex flex-col gap-4" noValidate>
                    <Field id={`${uid}-email`} label={t("Email", "البريد الإلكتروني")}>
                      <input
                        id={`${uid}-email`}
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        dir="ltr"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                        placeholder="name@example.com"
                        className={cn(fieldClass, lang === "ar" && "text-end")}
                      />
                    </Field>
                    <Field id={`${uid}-password`} label={t("Password", "كلمة المرور")}>
                      <div className="relative">
                        <input
                          id={`${uid}-password`}
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          dir="ltr"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={loading}
                          className={cn(fieldClass, "pe-14")}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? t("Hide password", "إخفاء كلمة المرور") : t("Show password", "إظهار كلمة المرور")}
                          aria-pressed={showPassword}
                          className="absolute end-1.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-white hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                        >
                          {showPassword ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
                        </button>
                      </div>
                    </Field>

                    <div className="-mt-2 flex justify-end">
                      <LinkButton onClick={() => goTo("forgot")}>{t("Forgot password?", "نسيت كلمة المرور؟")}</LinkButton>
                    </div>

                    <ErrorBox message={errorMsg} />

                    <button type="submit" disabled={loading} className={cn(pill.primary, "min-h-[52px] text-base")}>
                      {loading ? <Spinner /> : null}
                      {loading ? t("Signing in…", "جارٍ تسجيل الدخول…") : t("Sign in", "تسجيل الدخول")}
                    </button>

                    <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]" aria-hidden="true">
                      <span className="h-px flex-1 bg-[var(--border)]" />
                      {t("or", "أو")}
                      <span className="h-px flex-1 bg-[var(--border)]" />
                    </div>
                    <button type="button" onClick={() => goTo("magic")} className={cn(pill.outline, "min-h-[52px] text-base")}>
                      {t("Email me a magic link", "أرسل لي رابطًا سحريًا")}
                    </button>
                  </form>
                )}

                {/* ── magic link ── */}
                {screen === "magic" && (
                  <form onSubmit={handleMagicLink} className="flex flex-col gap-4" noValidate>
                    <Field id={`${uid}-email-magic`} label={t("Email", "البريد الإلكتروني")}>
                      <input
                        id={`${uid}-email-magic`}
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        dir="ltr"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                        placeholder="name@example.com"
                        className={cn(fieldClass, lang === "ar" && "text-end")}
                      />
                    </Field>
                    <ErrorBox message={errorMsg} />
                    <button type="submit" disabled={loading} className={cn(pill.primary, "min-h-[52px] text-base")}>
                      {loading ? <Spinner /> : null}
                      {loading ? t("Sending…", "جارٍ الإرسال…") : t("Send magic link", "أرسل الرابط السحري")}
                    </button>
                    <button type="button" onClick={() => goTo("signin")} className={cn(pill.ghost, "min-h-11")}>
                      {t("Use email and password instead", "استخدم البريد وكلمة المرور بدلًا من ذلك")}
                    </button>
                  </form>
                )}

                {/* ── sign up ── */}
                {screen === "signup" && (
                  <SignupForm
                    lang={lang}
                    fullName={fullName}
                    onFullName={setFullName}
                    dob={dob}
                    onDob={setDob}
                    email={email}
                    onEmail={setEmail}
                    password={password}
                    onPassword={setPassword}
                    loading={loading}
                    errorMsg={errorMsg}
                    onSubmit={handleSignUp}
                    onMagicLink={handleSignUpMagicLink}
                    onSignIn={() => goTo("signin")}
                  />
                )}

                {/* ── forgot password ── */}
                {screen === "forgot" && (
                  <form onSubmit={handleForgotPassword} className="flex flex-col gap-4" noValidate>
                    <Field id={`${uid}-email-forgot`} label={t("Email", "البريد الإلكتروني")}>
                      <input
                        id={`${uid}-email-forgot`}
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        dir="ltr"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                        placeholder="name@example.com"
                        className={cn(fieldClass, lang === "ar" && "text-end")}
                      />
                    </Field>
                    <ErrorBox message={errorMsg} />
                    <button type="submit" disabled={loading} className={cn(pill.primary, "min-h-[52px] text-base")}>
                      {loading ? <Spinner /> : null}
                      {loading ? t("Sending…", "جارٍ الإرسال…") : t("Send reset link", "أرسل رابط إعادة التعيين")}
                    </button>
                    <button type="button" onClick={() => goTo("signin")} className={cn(pill.ghost, "min-h-11")}>
                      {t("Back to sign in", "العودة لتسجيل الدخول")}
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
