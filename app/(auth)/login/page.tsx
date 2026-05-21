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

/* ─── language detection ─────────────────────────────────────── */
function detectLang(): "ar" | "en" {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language || "en";
  return lang.startsWith("ar") ? "ar" : "en";
}

const taglines = {
  ar: "حافظ على ذاكرة عائلتك للأجيال القادمة",
  en: "Preserve your family's memory for generations to come",
};

/* ─── floating-label input ───────────────────────────────────── */
function FloatingInput({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const lifted = focused || value.length > 0;

  return (
    <div className="relative">
      <input
        id={id}
        type="email"
        autoComplete="email"
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
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lang] = useState<"ar" | "en">(() =>
    typeof window !== "undefined" ? detectLang() : "en"
  );

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
    // No-op for non-bootstrap emails. For bootstrap admins, pre-creates the
    // auth.users row via service-role so signInWithOtp doesn't hit the
    // "Signups not allowed" gate when the email isn't registered yet.
    await ensureBootstrapUser(parsed.data.email);
    const supabase = createClient();
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
          "bg-[oklch(0.26_0.10_15)] text-[oklch(0.99_0_0)]"
        )}
        style={{
          background:
            "linear-gradient(145deg, oklch(0.22 0.09 10) 0%, oklch(0.30 0.13 18) 50%, oklch(0.26 0.11 0) 100%)",
        }}
        aria-hidden="false"
      >
        {/* subtle texture overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff' fill-opacity='1'%3E%3Ccircle cx='1' cy='1' r='1'/%3E%3C/g%3E%3C/svg%3E\")",
          }}
        />

        {/* desktop: full horizontal logo + tagline */}
        <div className="hidden flex-col items-center gap-8 px-10 md:flex">
          <Image
            src="/logo.png"
            alt="Big Fat Family"
            width={1200}
            height={411}
            priority
            className="h-auto w-[min(420px,80%)] drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)] [filter:brightness(1.05)]"
            style={{ background: "white", borderRadius: "1.25rem", padding: "1.25rem 1.5rem" }}
          />
          <p
            className="max-w-xs text-center text-sm leading-relaxed text-[oklch(0.90_0.03_30)]"
            dir="auto"
          >
            {taglines[lang]}
          </p>
        </div>

        {/* mobile: emblem + tagline */}
        <div className="flex flex-col items-center gap-3 md:hidden">
          <Image
            src="/logo-mark.png"
            alt="Big Fat Family"
            width={64}
            height={64}
            priority
            className="h-12 w-12 drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
          />
          <p className="font-[Fraunces,Georgia,serif] text-2xl font-semibold tracking-tight">
            Big Fat Family
          </p>
          <p className="max-w-[22ch] text-center text-xs text-[oklch(0.90_0.03_30)]" dir="auto">
            {taglines[lang]}
          </p>
        </div>

        {/* decorative arc at right edge (desktop only) */}
        <svg
          className="pointer-events-none absolute -right-1 top-0 hidden h-full md:block"
          viewBox="0 0 60 800"
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M60 0 Q0 400 60 800 L60 0Z" fill="oklch(0.99 0.005 80)" />
        </svg>
      </div>

      {/* ── form panel ── */}
      <div className="flex flex-1 items-center justify-center bg-[var(--background)] px-6 py-12">
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
                      Enter your email — we'll send you a magic link.
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
                            Sending…
                          </>
                        ) : (
                          "Send magic link"
                        )}
                      </Button>
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
