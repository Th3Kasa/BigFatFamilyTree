"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { BOOTSTRAP_ADMIN_EMAILS } from "@/lib/auth/bootstrap";

export type EnsureBootstrapResult =
  | { ok: true }
  | { ok: false; reason: "not_bootstrap" | "create_failed" };

// Idempotent: pre-creates a bootstrap-admin user in auth.users via service-role
// so signInWithOtp can send the magic link even when Supabase signups are disabled.
// Safe to call for non-bootstrap emails — they get a {ok:false, not_bootstrap} no-op.
export async function ensureBootstrapUser(
  rawEmail: string,
): Promise<EnsureBootstrapResult> {
  const email = (rawEmail ?? "").toLowerCase().trim();
  if (!email || !BOOTSTRAP_ADMIN_EMAILS.has(email)) {
    return { ok: false, reason: "not_bootstrap" };
  }

  const svc = createServiceClient();
  const { data, error } = await svc.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    const status = (error as { status?: number }).status;
    const alreadyExists =
      status === 422 ||
      msg.includes("registered") ||
      msg.includes("already") ||
      msg.includes("exists");
    if (alreadyExists) {
      return { ok: true };
    }
    console.error("[ensureBootstrapUser] createUser failed:", error);
    return { ok: false, reason: "create_failed" };
  }

  if (data?.user?.id) {
    await svc
      .from("profiles")
      .upsert({ id: data.user.id, role: "admin" }, { onConflict: "id" });
  }

  return { ok: true };
}
