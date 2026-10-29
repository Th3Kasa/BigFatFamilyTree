import "server-only";
import { cookies, headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { writeAudit } from "@/lib/members/account-admin";
import {
  clearedDeviceCookieOptions,
  DEVICE_COOKIE,
  deviceCookieOptions,
  deviceStatus,
  generateDeviceToken,
  hashDeviceToken,
  idsToEvict,
  isPlausibleToken,
  isUsablePinProfile,
  userAgentHint,
  type DeviceRow,
} from "@/lib/auth/pin-device";

// "Remember this device": the I/O half. Service role only; pin_devices has no
// client policies (migration 27). Nothing here logs or audits a token, and the
// cookie never carries a name, birthday or profile id.

export type RememberedDevice = {
  deviceId: string;
  profileId: string;
  nameKey: string;
  dateOfBirth: string | null;
  firstName: string;
  /** Initials for the avatar, e.g. "AM". The last name itself is not exposed. */
  initials: string;
};

export type DeviceLookup =
  | { state: "none" }
  /** A cookie is present but matches nothing usable: the caller should clear it. */
  | { state: "stale" }
  | { state: "ok"; device: RememberedDevice };

async function currentToken(): Promise<string | null> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  return isPlausibleToken(token) ? token : null;
}

export async function clearDeviceCookie(): Promise<void> {
  (await cookies()).set(DEVICE_COOKIE, "", clearedDeviceCookieOptions());
}

async function setDeviceCookie(token: string): Promise<void> {
  (await cookies()).set(DEVICE_COOKIE, token, deviceCookieOptions());
}

const firstLetter = (s: string | null | undefined) => Array.from((s ?? "").trim())[0]?.toUpperCase() ?? "";

/**
 * Resolve the cookie to a profile (read-only, so it is safe in a Server
 * Component). Unknown, expired and non-PIN profiles all come back as "stale".
 */
export async function lookupRememberedDevice(): Promise<DeviceLookup> {
  const raw = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (raw === undefined) return { state: "none" };
  if (!isPlausibleToken(raw)) return { state: "stale" };

  const svc = createServiceClient();
  const { data: row } = await svc
    .from("pin_devices")
    .select("id, profile_id, last_used_at")
    .eq("token_hash", hashDeviceToken(raw))
    .maybeSingle();
  if (deviceStatus(row as Pick<DeviceRow, "last_used_at"> | null, Date.now()) !== "valid" || !row) return { state: "stale" };

  const { data: profile } = await svc
    .from("profiles")
    .select("login_method, name_key, date_of_birth, first_name, last_name")
    .eq("id", row.profile_id)
    .maybeSingle();
  if (!isUsablePinProfile(profile) || !profile.first_name) return { state: "stale" };

  return {
    state: "ok",
    device: {
      deviceId: row.id,
      profileId: row.profile_id,
      nameKey: profile.name_key,
      dateOfBirth: profile.date_of_birth,
      firstName: profile.first_name,
      initials: firstLetter(profile.first_name) + firstLetter(profile.last_name),
    },
  };
}

/** Delete the row for the token in this request's cookie, if any. Returns whether a row went. */
async function deleteCurrentRow(profileId?: string): Promise<boolean> {
  const token = await currentToken();
  if (!token) return false;
  let q = createServiceClient().from("pin_devices").delete().eq("token_hash", hashDeviceToken(token));
  if (profileId) q = q.eq("profile_id", profileId);
  const { data } = await q.select("id");
  return (data?.length ?? 0) > 0;
}

/** "Not you?" and sign-out: forget THIS device only (row + cookie). Never throws. */
export async function forgetCurrentDevice(): Promise<void> {
  try {
    await deleteCurrentRow();
  } catch (e) {
    console.error("[pin-device] could not delete the device row:", e instanceof Error ? e.message : e);
  }
  try {
    await clearDeviceCookie();
  } catch {
    /* cookies can't be set from here (render context); the next action clears it */
  }
}

/**
 * Remember this device after a successful PIN sign-in/join. Best effort: a
 * failure here must never fail the sign-in itself.
 *  * the cookie already belongs to this member: just extend it;
 *  * otherwise issue a fresh token, drop whatever row the old cookie pointed at,
 *    and keep at most MAX_DEVICES_PER_PROFILE rows (oldest evicted).
 */
export async function rememberDevice(profileId: string): Promise<void> {
  try {
    const svc = createServiceClient();
    const existing = await currentToken();
    if (existing) {
      const { data: row } = await svc
        .from("pin_devices")
        .select("id, profile_id, last_used_at")
        .eq("token_hash", hashDeviceToken(existing))
        .maybeSingle();
      if (row && row.profile_id === profileId && deviceStatus(row, Date.now()) === "valid") {
        await svc.from("pin_devices").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
        await setDeviceCookie(existing);
        return;
      }
      if (row) await svc.from("pin_devices").delete().eq("id", row.id);
    }

    const token = generateDeviceToken();
    const hint = userAgentHint((await headers()).get("user-agent"));
    const { data: inserted, error } = await svc
      .from("pin_devices")
      .insert({ profile_id: profileId, token_hash: hashDeviceToken(token), user_agent_hint: hint })
      .select("id")
      .single();
    if (error || !inserted) {
      console.error("[pin-device] could not store the device:", error?.message);
      return;
    }

    const { data: rows } = await svc.from("pin_devices").select("id, profile_id, last_used_at").eq("profile_id", profileId);
    const evict = idsToEvict((rows ?? []) as DeviceRow[], inserted.id);
    if (evict.length > 0) await svc.from("pin_devices").delete().in("id", evict);

    await setDeviceCookie(token);
    await writeAudit({
      actorId: profileId,
      rowId: profileId,
      operation: "update",
      before: null,
      after: { event: "pin_device_remembered", device: hint },
    });
  } catch (e) {
    console.error("[pin-device] remember failed:", e instanceof Error ? e.message : e);
  }
}

/** A successful PIN-only sign-in: extend the row and the cookie. Best effort. */
export async function touchDevice(deviceId: string): Promise<void> {
  try {
    const token = await currentToken();
    await createServiceClient().from("pin_devices").update({ last_used_at: new Date().toISOString() }).eq("id", deviceId);
    if (token) await setDeviceCookie(token);
  } catch (e) {
    console.error("[pin-device] touch failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * Delete every remembered device of a member (admin PIN reset, PIN change,
 * PIN set-up from email). Audits `pin_devices_revoked` with a count and the
 * reason, only when something was actually revoked. Returns how many.
 */
export async function revokeDevices(actorId: string, profileId: string, reason: string): Promise<number> {
  try {
    const { data, error } = await createServiceClient().from("pin_devices").delete().eq("profile_id", profileId).select("id");
    if (error) {
      console.error("[pin-device] revoke failed:", error.message);
      return 0;
    }
    const count = data?.length ?? 0;
    if (count > 0) {
      await writeAudit({
        actorId,
        rowId: profileId,
        operation: "update",
        before: null,
        after: { event: "pin_devices_revoked", count, reason },
      });
    }
    return count;
  } catch (e) {
    console.error("[pin-device] revoke failed:", e instanceof Error ? e.message : e);
    return 0;
  }
}
