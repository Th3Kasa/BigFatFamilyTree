import "server-only";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import type { MemberRole } from "./types";

// The only place (with lib/notify/email.ts and the bootstrap-admin login) where
// the Supabase service-role key is used for member accounts. Server-only: the
// module cannot be imported from a client component. Callers must already have
// verified the super admin (getSuperAdminContext) before calling anything here.

/** Where the invite email sends people: /auth/callback, then on to /welcome. */
export async function inviteRedirectUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return `${configured.replace(/\/+$/, "")}/auth/callback?next=/welcome`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/auth/callback?next=/welcome`;
}

export type InviteResult =
  | { ok: true; profileId: string; setupWarning?: "profile" | "person" }
  | { ok: false; reason: "exists"; profileId: string | null }
  | { ok: false; reason: "failed"; detail?: string };

/** Is there already an account for this address? */
async function existingProfileId(email: string): Promise<string | null> {
  const svc = createServiceClient();
  const { data } = await svc.from("profiles").select("id").eq("email", email).limit(1).maybeSingle();
  return data?.id ?? null;
}

/**
 * Invite by email, then set the role, approval and person link on the profile
 * that the handle_new_user trigger creates.
 */
export async function inviteAccount(input: {
  adminId: string;
  email: string;
  fullName: string;
  dateOfBirth: string | null;
  role: MemberRole;
  approveNow: boolean;
  personId: string | null;
  redirectTo: string;
}): Promise<InviteResult> {
  const svc = createServiceClient();

  const existing = await existingProfileId(input.email);
  if (existing) return { ok: false, reason: "exists", profileId: existing };

  const { data, error } = await svc.auth.admin.inviteUserByEmail(input.email, {
    data: { full_name: input.fullName, ...(input.dateOfBirth ? { date_of_birth: input.dateOfBirth } : {}) },
    redirectTo: input.redirectTo,
  });
  if (error || !data.user) {
    if (error?.status === 422 || /already (been )?registered|already exists/i.test(error?.message ?? "")) {
      return { ok: false, reason: "exists", profileId: await existingProfileId(input.email) };
    }
    return { ok: false, reason: "failed", detail: error?.message };
  }
  const profileId = data.user.id;

  // Service role is a backend role, so the profiles guard lets these through.
  const update: Record<string, unknown> = { role: input.role };
  if (input.approveNow || input.role === "admin") {
    update.approved_at = new Date().toISOString();
    update.approved_by = input.adminId;
  }
  const { error: profileErr } = await svc.from("profiles").update(update).eq("id", profileId);
  if (profileErr) return { ok: true, profileId, setupWarning: "profile" };

  if (input.personId) {
    const { error: linkErr } = await svc.from("profiles").update({ person_id: input.personId }).eq("id", profileId);
    if (linkErr) return { ok: true, profileId, setupWarning: "person" };
  }

  await writeAudit({
    actorId: input.adminId,
    rowId: profileId,
    operation: "insert",
    before: null,
    after: { full_name: input.fullName, role: input.role, approved: input.approveNow, invited: true },
  });
  return { ok: true, profileId };
}

/** Audit rows normally come from triggers (actor = the signed-in user). Service-role changes need an explicit one. */
export async function writeAudit(entry: {
  actorId: string;
  rowId: string;
  operation: "insert" | "update" | "delete";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const svc = createServiceClient();
    await svc.from("audit_log").insert({
      actor_id: entry.actorId,
      table_name: "profiles",
      row_id: entry.rowId,
      operation: entry.operation,
      before: entry.before as never,
      after: entry.after as never,
    });
  } catch (e) {
    console.error("[audit] could not write entry:", e instanceof Error ? e.message : e);
  }
}

/**
 * Delete the auth user; the profile, link requests and suggestions cascade.
 * The person in the tree is untouched (only the link to it goes away).
 */
export async function deleteAccount(input: {
  adminId: string;
  profileId: string;
  snapshot: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; detail?: string }> {
  const svc = createServiceClient();
  // Write the audit entry first: the actor's profile still exists, and a failed
  // delete leaves an honest "attempted" trail rather than nothing.
  await writeAudit({
    actorId: input.adminId,
    rowId: input.profileId,
    operation: "delete",
    before: input.snapshot,
    after: null,
  });
  const { error } = await svc.auth.admin.deleteUser(input.profileId);
  if (error) return { ok: false, detail: error.message };
  return { ok: true };
}
