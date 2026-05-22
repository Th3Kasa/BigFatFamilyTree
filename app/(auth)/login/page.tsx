"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Loader2, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { magicLinkSchema } from "@/lib/validation/auth";
import { ensureBootstrapUser } from "./actions";
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
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [screen, setScreen] = useState<Screen>("signin");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resendRemaining = useResendCountdown(screen === "sent-magic");
  const canResend = resendRemaining === 0;

  function goTo(s: Screen) {
    setScreen(s);
    setErrorMsg(null);
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
    const bootstrapResult = await ensureBootstrapUser(parsed.data.email);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password });
    setLoading(false);
    if (error) {
      // Always show bootstrap state so we know whether the bootstrap action ran
      const tag = bootstrapResult.ok
        ? bootstrapResult.details
          ? `[bootstrap ok: ${bootstrapResult.details}]`
          : "[bootstrap ok]"
        : `[bootstrap failed: ${bootstrapResult.reason}${bootstrapResult.details ? ` — ${bootstrapResult.details}` : ""}]`;
      setErrorMsg(`${error.message} ${tag}`);
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
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) { setErrorMsg(error.message); return; }
    goTo("sent-magic");
  }

  async function handleResend() {
    if (!canResend) return;
    await handleMagicLink({ preventDefault: () => {} } as React.FormEvent);
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const parsed = magicLinkSchema.safeParse({ email });
    if (!parsed.success) { setErrorMsg("Enter a valid email address."); return; }
    if (password.length < 6) { setErrorMsg("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setErrorMsg("Passwords do not match."); return; }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) { setErrorMsg(error.message); return; }
    goTo("sent-signup");
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const parsed = magicLinkSchema.safeParse({ email });
    if (!parsed.success) { setErrorMsg("Enter a valid email address."); return; }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (error) { setErrorMsg(error.message); return; }
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
                    <CardTitle className="text-xl">Confirm your account</CardTitle>
                    <CardDescription className="mt-1">
                      Check your email to confirm your account at{" "}
                      <span className="font-medium text-[var(--foreground)]">{email}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-center">
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Didn&apos;t receive it? Check your spam folder.
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
                    <CardTitle className="text-xl">Create account</CardTitle>
                    <CardDescription>Enter your details to get started.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSignUp} className="space-y-4" noValidate>
                      <FloatingInput
                        id="email-signup"
                        label="Email address"
                        value={email}
                        onChange={setEmail}
                        disabled={loading}
                      />
                      <FloatingInput
                        id="password-signup"
                        label="Password"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={setPassword}
                        disabled={loading}
                        showToggle
                      />
                      <FloatingInput
                        id="confirm-password"
                        label="Confirm password"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        disabled={loading}
                        showToggle
                      />

                      {errorMsg && (
                        <Alert variant="destructive" className="py-2">
                          <AlertDescription>{errorMsg}</AlertDescription>
                        </Alert>
                      )}

                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? (
                          <><Loader2 className="animate-spin" /> Creating account…</>
                        ) : "Create account"}
                      </Button>

                      <p className="text-center text-xs text-[var(--muted-foreground)]">
                        Already have an account?{" "}
                        <button
                          type="button"
                          onClick={() => goTo("signin")}
                          className="font-medium text-[var(--foreground)] underline-offset-4 hover:underline"
                        >
                          Sign in
                        </button>
                      </p>
                    </form>
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
