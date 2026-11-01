"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updatePasswordRedirect } from "@/lib/auth/pin-setup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/** updatePasswordRedirect for the signed-in account (the profile row says whether it's an admin). */
async function passwordRedirect(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || user.app_metadata?.login !== "pin") return null;
  const { data: profile } = await supabase.from("profiles").select("role, is_super_admin").eq("id", user.id).maybeSingle();
  const isAdmin = profile?.role === "admin" || !!profile?.is_super_admin;
  return updatePasswordRedirect(user.app_metadata, { email: user.email, isAdmin });
}

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // A PIN account signs in with its PIN. Setting an email password here would
  // replace the PIN-derived one and break PIN sign-in, so send it to "Change my
  // PIN". Admins with a real email sign in by email, so they stay.
  useEffect(() => {
    passwordRedirect()
      .then((to) => {
        if (to) router.replace(to);
      })
      .catch(() => {});
  }, [router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const to = await passwordRedirect();
      if (to) {
        router.replace(to);
        return;
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        setError(updateErr.message);
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/"), 2000);
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--background)]">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl">Set new password</CardTitle>
          <CardDescription>
            {done
              ? "Password updated! Redirecting…"
              : "Choose a strong password for your account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <p className="text-center text-sm text-[var(--muted-foreground)]">
              You will be redirected shortly.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <p className="text-sm text-[var(--destructive)] bg-[var(--destructive)]/5 border border-[var(--destructive)]/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <div className="space-y-1.5">
                <label htmlFor="new-password" className="block text-sm font-medium text-[var(--foreground)]">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="block text-sm font-medium text-[var(--foreground)]">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving…
                  </>
                ) : (
                  "Update password"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
