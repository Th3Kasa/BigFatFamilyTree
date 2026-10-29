import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { generateFamilyPin } from "@/lib/auth/pin-crypto";

// The family PIN: a 6-digit invite code the owner shares in the family group.
// It only proves "this person was told about the site"; new accounts still wait
// for an admin's approval. Stored in public.family_settings (admins can read it,
// only the super admin can change it); the server reads it with the service role.
// Callers must have verified the caller's role before calling the admin helpers.

const KEY = "family_pin";

type Svc = ReturnType<typeof createServiceClient>;

async function read(svc: Svc): Promise<string | null> {
  const { data, error } = await svc.from("family_settings").select("value").eq("key", KEY).maybeSingle();
  if (error) throw new Error(`family PIN read failed: ${error.message}`);
  const value = (data as { value?: string } | null)?.value;
  return value && /^\d{6}$/.test(value) ? value : null;
}

/**
 * The current family PIN. On the very first read a random one is created
 * (insert-if-absent, so two simultaneous first reads agree on the winner).
 */
export async function getOrCreateFamilyPin(svc: Svc = createServiceClient()): Promise<string> {
  const existing = await read(svc);
  if (existing) return existing;
  await svc
    .from("family_settings")
    .upsert({ key: KEY, value: generateFamilyPin() }, { onConflict: "key", ignoreDuplicates: true });
  const created = await read(svc);
  if (!created) throw new Error("family PIN could not be created");
  return created;
}

/** Replace the family PIN. Existing members are unaffected; only new joins need the new code. */
export async function rotateFamilyPin(updatedBy: string, svc: Svc = createServiceClient()): Promise<string> {
  const previous = await read(svc);
  let next = generateFamilyPin();
  while (next === previous) next = generateFamilyPin();
  const { error } = await svc
    .from("family_settings")
    .upsert({ key: KEY, value: next, updated_at: new Date().toISOString(), updated_by: updatedBy }, { onConflict: "key" });
  if (error) throw new Error(`family PIN update failed: ${error.message}`);
  return next;
}
