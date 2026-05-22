"use server";

import { createServiceClient } from "@/lib/supabase/service";
import {
  BOOTSTRAP_ADMIN_EMAILS,
  bootstrapPasswordFor,
} from "@/lib/auth/bootstrap";

export type EnsureBootstrapResult =
  | { ok: true }
  | { ok: false; reason: "not_bootstrap" | "create_failed" };

async function findUserByEmail(
  svc: ReturnType<typeof createServiceClient>,
  email: string,
): Promise<string | null> {
  // The Supabase admin SDK doesn't expose a direct "get by email" — page
  // through users until we find a match. Family-tree admin set is tiny, so
  // a single page is enough.
  type AdminUser = { id: string; email?: string | null };
  const { data } = await svc.auth.admin.listUsers({ perPage: 200 });
  const list = (data?.users ?? []) as AdminUser[];
  const match = list.find(
    (u) => (u.email ?? "").toLowerCase().trim() === email,
  );
  return match?.id ?? null;
}

// Idempotent: ensures a bootstrap-admin user exists in auth.users, has the
// optional bootstrap password set, and has role='admin' in profiles.
// Safe to call for non-bootstrap emails — no-op returns {ok:false, not_bootstrap}.
export async function ensureBootstrapUser(
  rawEmail: string,
): Promise<EnsureBootstrapResult> {
  const email = (rawEmail ?? "").toLowerCase().trim();
  if (!email || !BOOTSTRAP_ADMIN_EMAILS.has(email)) {
    return { ok: false, reason: "not_bootstrap" };
  }

  const svc = createServiceClient();
  const password = bootstrapPasswordFor(email);

  // Try to create with email + password (idempotent: a 422 means user exists)
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    email_confirm: true,
    ...(password ? { password } : {}),
  });

  let userId: string | null = created?.user?.id ?? null;

  if (createErr) {
    const msg = createErr.message?.toLowerCase() ?? "";
    const status = (createErr as { status?: number }).status;
    const alreadyExists =
      status === 422 ||
      msg.includes("registered") ||
      msg.includes("already") ||
      msg.includes("exists");
    if (!alreadyExists) {
      console.error("[ensureBootstrapUser] createUser failed:", createErr);
      return { ok: false, reason: "create_failed" };
    }
    // User already exists — look up id so we can update password + profile role
    try {
      userId = await findUserByEmail(svc, email);
    } catch (e) {
      console.error("[ensureBootstrapUser] lookup failed:", e);
    }
  }

  // Ensure the password is set every time so the user can rely on it even if
  // it was previously rotated by Supabase or never persisted.
  if (userId && password) {
    const { error: updErr } = await svc.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updErr) {
      console.error("[ensureBootstrapUser] password update failed:", updErr);
    }
  }

  // Promote to admin in profiles (covered by the auth callback too, but
  // upsert here so password-login users don't need to wait for callback).
  if (userId) {
    await svc
      .from("profiles")
      .upsert({ id: userId, role: "admin" }, { onConflict: "id" });
  }

  return { ok: true };
}
