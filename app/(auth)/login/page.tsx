"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Loader2 } from "lucide-react";
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
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  type?: "email" | "password" | "text";
  autoComplete?: string;
}) {
  const [focused, setFocused] = useState(false);
  const lifted = focused || value.length > 0;

  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        autoComplete={autoComplete ?? (type === "password" ? "current-password" : "email")}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        className={cn(
          "peer w-full rounded-lg border border-[var(--border)] bg-transparent px-4 pb-2 pt-5 text-sm text-[var(--foreground)] shadow-sm transition-colors",
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

/* ─── main page ──────────────────────────────────────────────── */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resendRemaining = useResendCountdown(status === "sent");
  const canResend = resendRemaining === 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const parsed = magicLinkSchema.safeParse({ email });
    if (!parsed.success) {
      setStatus("error");
      setErrorMsg("Enter a valid email address.");
      return;
    }
    setStatus("sending");

    // Ensure bootstrap admins exist + their password is set on Supabase.
    // No-op for non-bootstrap emails.
    await ensureBootstrapUser(parsed.data.email);
    const supabase = createClient();

    if (mode === "password") {
      if (!password) {
        setStatus("error");
        setErrorMsg("Enter your password.");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password,
      });
      if (error) {
        setStatus("error");
        setErrorMsg(error.message);
        return;
      }
      // Signed in — go home
      window.location.href = "/";
      return;
    }

    // Magic-link fallback
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }
    setStatus("sent");
  }

  async function handleResend() {
    if (!canResend) return;
    await onSubmit({ preventDefault: () => {} } as React.FormEvent);
  }

  function handleReset() {
    setStatus("idle");
    setErrorMsg(null);
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
        {/* ambient drifting grain */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='160' height='160' viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            animation: "ambient-drift 18s ease-in-out infinite",
          }}
        />

        {/* desktop: full horizontal logo + tagline */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0.32, 1] }}
          className="hidden flex-col items-center gap-9 px-10 md:flex"
        >
          <div className="relative">
            {/* Soft accent halo behind the logo */}
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

        {/* mobile: emblem + tagline */}
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

        {/* decorative arc at right edge (desktop only) */}
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
              {status === "sent" ? (
                /* ── success state ── */
                <motion.div
                  key="sent"
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
                      Didn't receive it? Check your spam folder.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canResend}
                      onClick={handleResend}
                      className="w-full"
                    >
                      {canResend
                        ? "Resend link"
                        : `Resend in ${resendRemaining}s`}
                    </Button>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="text-xs text-[var(--muted-foreground)] underline-offset-4 hover:underline"
                    >
                      Use a different email
                    </button>
                  </CardContent>
                </motion.div>
              ) : (
                /* ── form state ── */
                <motion.div
                  key="form"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <CardHeader>
                    <CardTitle className="text-xl">Sign in</CardTitle>
                    <CardDescription>
                      {mode === "password"
                        ? "Enter your email and password."
                        : "Enter your email — we'll send you a magic link."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={onSubmit} className="space-y-4" noValidate>
                      <FloatingInput
                        id="email"
                        label="Email address"
                        value={email}
                        onChange={setEmail}
                        disabled={status === "sending"}
                      />

                      {mode === "password" && (
                        <FloatingInput
                          id="password"
                          label="Password"
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={setPassword}
                          disabled={status === "sending"}
                        />
                      )}

                      {errorMsg && (
                        <Alert variant="destructive" className="py-2">
                          <AlertDescription>{errorMsg}</AlertDescription>
                        </Alert>
                      )}

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={status === "sending"}
                      >
                        {status === "sending" ? (
                          <>
                            <Loader2 className="animate-spin" />
                            {mode === "password" ? "Signing in…" : "Sending…"}
                          </>
                        ) : mode === "password" ? (
                          "Sign in"
                        ) : (
                          "Send magic link"
                        )}
                      </Button>

                      <button
                        type="button"
                        onClick={() => {
                          setMode((m) => (m === "password" ? "magic" : "password"));
                          setErrorMsg(null);
                        }}
                        className="block w-full text-center text-xs text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
                      >
                        {mode === "password"
                          ? "Use a magic link instead"
                          : "Use email + password instead"}
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
