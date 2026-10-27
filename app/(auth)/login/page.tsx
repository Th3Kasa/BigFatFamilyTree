"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Loader2, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { magicLinkSchema } from "@/lib/validation/auth";
import { signUpProfileSchema } from "@/lib/validation/members";
import { SignupForm, useDocumentLang } from "@/components/auth/SignupForm";
import { ensureBootstrapUser, signInBootstrapAdmin } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/* ─── floating-label input ───────────────────────────────────── */
function FloatingInput({
  id,
  label,
  value,
  onChange,
  disabled,
  type = "email",
  autoComplete,
  showToggle,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  type?: "email" | "password" | "text";
  autoComplete?: string;
  showToggle?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const lifted = focused || value.length > 0;
  const inputType = type === "password" ? (visible ? "text" : "password") : type;

  return (
    <div className="relative">
      <input
        id={id}
        type={inputType}
        autoComplete={autoComplete ?? (type === "password" ? "current-password" : "email")}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        className={cn(
          "peer w-full rounded-lg border border-[var(--border)] bg-transparent pb-2 pt-5 text-sm text-[var(--foreground)] shadow-sm transition-colors",
          showToggle ? "px-4 pr-10" : "px-4",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      />
      <label
        htmlFor={id}
        className={cn(
          "pointer-events-none absolute start-4 text-[var(--muted-foreground)] transition-all duration-150",
          lifted ? "top-1.5 text-[10px] font-medium text-[var(--primary)]" : "top-3.5 text-sm"
        )}
      >
        {label}
      </label>
      {showToggle && type === "password" && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

/* ─── resend countdown ───────────────────────────────────────── */
function useResendCountdown(active: boolean, seconds = 30) {
  const [remaining, setRemaining] = useState(seconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      setRemaining(seconds);
      return;
    }
    setRemaining(seconds);
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(intervalRef.current!);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [active, seconds]);

  return remaining;
}

type Screen = "signin" | "magic" | "signup" | "forgot" | "sent-magic" | "sent-signup" | "sent-reset";

/* ─── main page ──────────────────────────────────────────────── */

// Supabase's built-in mailer allows only a few emails per hour for the whole
// project; turn its raw error into something a family member understands.
function friendlyAuthError(error: { message: string; status?: number }): string {
  if (error.status === 429 || /rate limit/i.test(error.message)) {
    return "Too many emails were sent just now. Please wait a few minutes and try again.";
  }
  return error.message;
}

// Sign-up is the one flow used by the whole family (often on phones, often in
// Arabic), so its errors are plain-language and bilingual. Anything unexpected
// falls through to friendlyAuthError.
function friendlySignupError(error: { message: string; status?: number }, lang: "ar" | "en"): string {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const msg = error.message;
  if (error.status === 429 || /rate limit/i.test(msg)) {
    return t(
      "Too many emails were sent just now. Please wait a few minutes and try again.",
      "تم إرسال عدد كبير من الرسائل الآن. انتظر بضع دقائق ثم حاول مرة أخرى.",
    );
  }
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
  return friendlyAuthError(error);
}

export default function LoginPage() {
  const lang = useDocumentLang();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  // Where a magic link should land after sign-in ("/welcome" for new sign-ups).
  const [afterAuth, setAfterAuth] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("signin");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resendRemaining = useResendCountdown(screen === "sent-magic");
  const canResend = resendRemaining === 0;

  function goTo(s: Screen) {
    setScreen(s);
    setErrorMsg(null);
    if (s !== "sent-magic") setAfterAuth(null);
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const parsed = magicLinkSchema.safeParse({ email });
    if (!parsed.success) {
      setErrorMsg("Enter a valid email address.");
      return;
    }
    if (!password) {
      setErrorMsg("Enter your password.");
      return;
    }
    setLoading(true);
    const supabase = createClient();

    // Path 1: bootstrap-admin login (works even if Supabase's email/password
    // provider is disabled — we verify the password server-side and exchange
    // a service-role-minted magic-link token for a session).
    const adminAttempt = await signInBootstrapAdmin(parsed.data.email, password);
    if (adminAttempt.ok) {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        token_hash: adminAttempt.tokenHash,
        type: "magiclink",
      });
      setLoading(false);
      if (verifyErr) {
        setErrorMsg(`Verify failed: ${verifyErr.message}`);
        return;
      }
      window.location.href = "/";
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
      const tag = bootstrapResult.ok
        ? bootstrapResult.details
          ? `[bootstrap ok: ${bootstrapResult.details}]`
          : "[bootstrap ok]"
        : `[bootstrap failed: ${bootstrapResult.reason}${bootstrapResult.details ? ` — ${bootstrapResult.details}` : ""}]`;
      const adminTag = adminAttempt.ok === false ? ` [admin: ${adminAttempt.error}]` : "";
      setErrorMsg(`${error.message} ${tag}${adminTag}`);
      return;
    }
    window.location.href = "/";
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const parsed = magicLinkSchema.safeParse({ email });
    if (!parsed.success) { setErrorMsg("Enter a valid email address."); return; }
    setLoading(true);
    await ensureBootstrapUser(parsed.data.email);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback${
          afterAuth ? `?next=${encodeURIComponent(afterAuth)}` : ""
        }`,
      },
    });
    setLoading(false);
    if (error) { setErrorMsg(friendlyAuthError(error)); return; }
    goTo("sent-magic");
  }

  async function handleResend() {
    if (!canResend) return;
    await handleMagicLink({ preventDefault: () => {} } as React.FormEvent);
  }

  // Validate the three things both sign-up routes need (name, date of birth,
  // email). Returns the clean values, or null after showing the first problem.
  function validateSignupBasics() {
    const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
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
    const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
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
    if (error) { setErrorMsg(friendlySignupError(error, lang)); return; }
    setAfterAuth("/welcome");
    goTo("sent-magic");
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const parsed = magicLinkSchema.safeParse({ email });
    if (!parsed.success) { setErrorMsg("Enter a valid email address."); return; }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
    });
    setLoading(false);
    if (error) { setErrorMsg(friendlyAuthError(error)); return; }
    goTo("sent-reset");
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* ── brand panel ── */}
      <div
        className={cn(
          "relative flex shrink-0 flex-col items-center justify-center overflow-hidden",
          "h-[30vh] md:h-auto md:w-1/2 lg:w-[52%]",
          "text-[oklch(0.99_0.006_60)]"
        )}
        style={{
          background:
            "radial-gradient(900px 600px at 80% -10%, oklch(0.62 0.20 38 / 0.55), transparent 60%), radial-gradient(900px 700px at 10% 110%, oklch(0.40 0.18 18 / 0.7), transparent 60%), linear-gradient(155deg, oklch(0.20 0.08 12) 0%, oklch(0.26 0.12 18) 40%, oklch(0.22 0.09 4) 100%)",
        }}
        aria-hidden="false"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='160' height='160' viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            animation: "ambient-drift 18s ease-in-out infinite",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0.32, 1] }}
          className="hidden flex-col items-center gap-9 px-10 md:flex"
        >
          <div className="relative">
            <div
              aria-hidden
              className="absolute inset-0 -m-6 rounded-[2rem] opacity-90 blur-2xl"
              style={{
                background:
                  "radial-gradient(closest-side, oklch(0.68 0.18 38 / 0.55), transparent 70%)",
              }}
            />
            <Image
              src="/logo.png"
              alt="Big Fat Family"
              width={1200}
              height={411}
              priority
              className="relative h-auto w-[min(440px,80%)] rounded-[1.5rem] bg-white px-7 py-6 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.55)] ring-1 ring-white/30 [filter:brightness(1.04)]"
            />
          </div>

          <p
            className="max-w-sm text-center text-[15px] leading-relaxed text-[oklch(0.93_0.03_30)]"
            style={{ fontFamily: "var(--font-display)", fontOpticalSizing: "auto" }}
          >
            Preserve your family&apos;s memory for generations to come
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0.32, 1] }}
          className="flex flex-col items-center gap-3 md:hidden"
        >
          <Image
            src="/logo-mark.png"
            alt="Big Fat Family"
            width={64}
            height={64}
            priority
            className="h-14 w-14 rounded-full bg-white p-1 shadow-[0_6px_24px_rgba(0,0,0,0.45)] ring-1 ring-white/30"
          />
          <p
            className="text-2xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Big Fat Family
          </p>
          <p className="max-w-[22ch] text-center text-xs text-[oklch(0.92_0.03_30)]">
            Preserve your family&apos;s memory for generations to come
          </p>
        </motion.div>

        <svg
          className="pointer-events-none absolute -right-px top-0 hidden h-full md:block"
          viewBox="0 0 60 800"
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M60 0 Q0 400 60 800 L60 0Z" fill="var(--background)" />
        </svg>
      </div>

      {/* ── form panel ── */}
      <div className="flex flex-1 items-center justify-center bg-[var(--background)] px-4 py-8 sm:px-6 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          <Card
            className="border-[var(--border)] shadow-[var(--shadow-deep)]"
            style={{ background: "var(--surface-2, white)" }}
          >
            <AnimatePresence mode="wait" initial={false}>

              {/* ── sent: magic link ── */}
              {screen === "sent-magic" && (
                <motion.div
                  key="sent-magic"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <CardHeader className="items-center text-center">
                    <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)]/10">
                      <Mail className="h-7 w-7 text-[var(--primary)]" strokeWidth={1.5} />
                    </div>
                    <CardTitle className="text-xl">Check your email</CardTitle>
                    <CardDescription className="mt-1">
                      We sent a sign-in link to{" "}
                      <span className="font-medium text-[var(--foreground)]">{email}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-center">
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Didn&apos;t receive it? Check your spam folder.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canResend}
                      onClick={handleResend}
                      className="w-full"
                    >
                      {canResend ? "Resend link" : `Resend in ${resendRemaining}s`}
                    </Button>
                    <button
                      type="button"
                      onClick={() => goTo("signin")}
                      className="text-xs text-[var(--muted-foreground)] underline-offset-4 hover:underline"
                    >
                      Back to sign in
                    </button>
                  </CardContent>
                </motion.div>
              )}

              {/* ── sent: sign up confirm ── */}
              {screen === "sent-signup" && (
                <motion.div
                  key="sent-signup"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <CardHeader className="items-center text-center">
                    <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)]/10">
                      <Mail className="h-7 w-7 text-[var(--primary)]" strokeWidth={1.5} />
                    </div>
                    <CardTitle className="text-xl">
                      {lang === "ar" ? "أكّد حسابك" : "Confirm your account"}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {lang === "ar" ? "افتح بريدك لتأكيد حسابك على " : "Check your email to confirm your account at "}
                      <span className="font-medium text-[var(--foreground)]" dir="ltr">{email}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-center">
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {lang === "ar"
                        ? "بعد التأكيد سنساعدك على إيجاد مكانك في شجرة العائلة. لم تصلك الرسالة؟ تحقق من البريد المزعج."
                        : "Once confirmed, we'll help you find your place in the family tree. Didn't receive it? Check your spam folder."}
                    </p>
                    <button
                      type="button"
                      onClick={() => goTo("signin")}
                      className="text-xs text-[var(--muted-foreground)] underline-offset-4 hover:underline"
                    >
                      Back to sign in
                    </button>
                  </CardContent>
                </motion.div>
              )}

              {/* ── sent: password reset ── */}
              {screen === "sent-reset" && (
                <motion.div
                  key="sent-reset"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <CardHeader className="items-center text-center">
                    <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)]/10">
                      <Mail className="h-7 w-7 text-[var(--primary)]" strokeWidth={1.5} />
                    </div>
                    <CardTitle className="text-xl">Check your email</CardTitle>
                    <CardDescription className="mt-1">
                      Password reset link sent — check your inbox at{" "}
                      <span className="font-medium text-[var(--foreground)]">{email}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-center">
                    <button
                      type="button"
                      onClick={() => goTo("signin")}
                      className="text-xs text-[var(--muted-foreground)] underline-offset-4 hover:underline"
                    >
                      Back to sign in
                    </button>
                  </CardContent>
                </motion.div>
              )}

              {/* ── sign in (password) ── */}
              {screen === "signin" && (
                <motion.div
                  key="signin"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <CardHeader>
                    <CardTitle className="text-xl">Sign in</CardTitle>
                    <CardDescription>Enter your email and password.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSignIn} className="space-y-4" noValidate>
                      <FloatingInput
                        id="email"
                        label="Email address"
                        value={email}
                        onChange={setEmail}
                        disabled={loading}
                      />
                      <FloatingInput
                        id="password"
                        label="Password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={setPassword}
                        disabled={loading}
                        showToggle
                      />

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => goTo("forgot")}
                          className="text-xs text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>

                      {errorMsg && (
                        <Alert variant="destructive" className="py-2">
                          <AlertDescription>{errorMsg}</AlertDescription>
                        </Alert>
                      )}

                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? (
                          <><Loader2 className="animate-spin" /> Signing in…</>
                        ) : "Sign in"}
                      </Button>

                      <button
                        type="button"
                        onClick={() => goTo("magic")}
                        className="block w-full text-center text-xs text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
                      >
                        Use a magic link instead
                      </button>

                      <p className="text-center text-xs text-[var(--muted-foreground)]">
                        Don&apos;t have an account?{" "}
                        <button
                          type="button"
                          onClick={() => goTo("signup")}
                          className="font-medium text-[var(--foreground)] underline-offset-4 hover:underline"
                        >
                          Sign up
                        </button>
                      </p>
                    </form>
                  </CardContent>
                </motion.div>
              )}

              {/* ── magic link ── */}
              {screen === "magic" && (
                <motion.div
                  key="magic"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <CardHeader>
                    <CardTitle className="text-xl">Sign in</CardTitle>
                    <CardDescription>Enter your email — we&apos;ll send you a magic link.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleMagicLink} className="space-y-4" noValidate>
                      <FloatingInput
                        id="email-magic"
                        label="Email address"
                        value={email}
                        onChange={setEmail}
                        disabled={loading}
                      />

                      {errorMsg && (
                        <Alert variant="destructive" className="py-2">
                          <AlertDescription>{errorMsg}</AlertDescription>
                        </Alert>
                      )}

                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? (
                          <><Loader2 className="animate-spin" /> Sending…</>
                        ) : "Send magic link"}
                      </Button>

                      <button
                        type="button"
                        onClick={() => goTo("signin")}
                        className="block w-full text-center text-xs text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
                      >
                        Use email + password instead
                      </button>

                      <p className="text-center text-xs text-[var(--muted-foreground)]">
                        Don&apos;t have an account?{" "}
                        <button
                          type="button"
                          onClick={() => goTo("signup")}
                          className="font-medium text-[var(--foreground)] underline-offset-4 hover:underline"
                        >
                          Sign up
                        </button>
                      </p>
                    </form>
                  </CardContent>
                </motion.div>
              )}

              {/* ── sign up ── */}
              {screen === "signup" && (
                <motion.div
                  key="signup"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <CardHeader>
                    <CardTitle className="text-xl">{lang === "ar" ? "أنشئ حسابك" : "Create your account"}</CardTitle>
                    <CardDescription>
                      {lang === "ar"
                        ? "أربع خانات صغيرة، ثم نساعدك على إيجاد مكانك في شجرة العائلة."
                        : "Four quick details, then we'll help you find your place in the family tree."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </motion.div>
              )}

              {/* ── forgot password ── */}
              {screen === "forgot" && (
                <motion.div
                  key="forgot"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <CardHeader>
                    <CardTitle className="text-xl">Forgot password?</CardTitle>
                    <CardDescription>
                      Enter your email and we&apos;ll send you a reset link.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleForgotPassword} className="space-y-4" noValidate>
                      <FloatingInput
                        id="email-forgot"
                        label="Email address"
                        value={email}
                        onChange={setEmail}
                        disabled={loading}
                      />

                      {errorMsg && (
                        <Alert variant="destructive" className="py-2">
                          <AlertDescription>{errorMsg}</AlertDescription>
                        </Alert>
                      )}

                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? (
                          <><Loader2 className="animate-spin" /> Sending…</>
                        ) : "Send reset link"}
                      </Button>

                      <button
                        type="button"
                        onClick={() => goTo("signin")}
                        className="block w-full text-center text-xs text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
                      >
                        Back to sign in
                      </button>
                    </form>
                  </CardContent>
                </motion.div>
              )}

            </AnimatePresence>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
