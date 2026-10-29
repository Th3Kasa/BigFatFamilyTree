"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { isBootstrapAdmin, bootstrapPasswordFor } from "@/lib/auth/bootstrap";
import { BOOTSTRAP_FAILED, countAdmins, promoteIfNoAdmins } from "@/lib/auth/bootstrap-admin";

// Every failure, whatever the cause (unknown email, wrong password,
// admins already exist, Supabase error), returns this same result.
export type EnsureBootstrapResult = { ok: true } | { ok: false; error: string };

const FAILED = { ok: false, error: BOOTSTRAP_FAILED } as const;

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

// Creates the FIRST admin of a fresh install, and nothing else. When any admin
// already exists this is a no-op that fails generically, so the bootstrap
// credentials can
// never re-promote an account or reset a password on a later sign-in.
export async function ensureBootstrapUser(
  rawEmail: string,
): Promise<EnsureBootstrapResult> {
  const email = (rawEmail ?? "").toLowerCase().trim();
  if (!isBootstrapAdmin(email)) return FAILED;

  try {
    const svc = createServiceClient();
    if ((await countAdmins(svc)) !== 0) return FAILED;

    const password = bootstrapPasswordFor(email);
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      email_confirm: true,
      ...(password ? { password } : {}),
    });

    let userId: string | null = created?.user?.id ?? null;
    if (createErr) {
      // The account may already exist (an earlier attempt); look it up.
      userId = await findUserByEmail(svc, email);
      if (!userId) {
        console.error("[bootstrap] could not create or find the first admin:", createErr.message);
        return FAILED;
      }
      if (password) await svc.auth.admin.updateUserById(userId, { password, email_confirm: true });
    }
    if (!userId) return FAILED;

    return (await promoteIfNoAdmins(svc, userId)) ? { ok: true } : FAILED;
  } catch (e) {
    console.error("[bootstrap] failed:", e instanceof Error ? e.message : e);
    return FAILED;
  }
}

// ── signInBootstrapAdmin ──────────────────────────────────────────────────────
// First-run only, for projects with email/password login disabled: while there
// are zero admins, the configured bootstrap email + password mint a session
// token for the first admin. After that it always fails generically.
export async function signInBootstrapAdmin(
  rawEmail: string,
  password: string,
): Promise<{ ok: true; tokenHash: string } | { ok: false; error: string }> {
  const email = (rawEmail ?? "").toLowerCase().trim();
  const expected = bootstrapPasswordFor(email);
  if (!isBootstrapAdmin(email) || !expected || password !== expected) return FAILED;

  try {
    const ensured = await ensureBootstrapUser(email);
    if (!ensured.ok) return FAILED;

    const svc = createServiceClient();
    const { data, error } = await svc.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !data?.properties?.hashed_token) return FAILED;
    return { ok: true, tokenHash: data.properties.hashed_token };
  } catch (e) {
    console.error("[bootstrap] sign-in failed:", e instanceof Error ? e.message : e);
    return FAILED;
  }
}
