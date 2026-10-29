"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getLang } from "@/lib/lang/server";
import { createServiceClient } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import { checkLimit } from "@/lib/ratelimit";
import { getAdminContext, getSuperAdminContext } from "@/lib/members/auth";
import { writeAudit } from "@/lib/members/account-admin";
import { callerOf, canActOn } from "@/lib/members/permissions";
import { rotateFamilyPin } from "@/lib/auth/family-pin";
import { derivePinPassword, generateTempPin } from "@/lib/auth/pin-crypto";
import {
  changeOwnPin,
  clearPinLockout,
  joinWithPin,
  pinAccountLockId,
  signInWithDevice,
  signInWithPin,
  type PinResult,
} from "@/lib/auth/pin-session";
import { forgetCurrentDevice, revokeDevices } from "@/lib/auth/pin-device-store";
import { setUpOwnPin } from "@/lib/auth/pin-setup-session";
import type { PinSetupInput } from "@/lib/auth/pin-setup";
import type { ChangePinInput, PinJoinInput, PinSignInInput } from "@/lib/auth/pin-validation";
import type { MemberActionResult } from "@/lib/members/types";

// Thin server-action wrappers. The real work (and every rule) lives in
// lib/auth/pin-session.ts and is re-checked there; admin actions re-check the
// caller's role from the database on every call.

export async function pinSignInAction(input: PinSignInInput): Promise<PinResult> {
  return signInWithPin(input, await getLang());
}

/** Returning device: the member is resolved from the httpOnly device cookie; only the PIN comes from the browser. */
export async function pinDeviceSignInAction(pin: string): Promise<PinResult> {
  return signInWithDevice(typeof pin === "string" ? pin : "", await getLang());
}

/** "Not you?" (and a stale cookie): forget this device, i.e. delete its row and clear the cookie. */
export async function forgetThisDeviceAction(): Promise<void> {
  await forgetCurrentDevice();
}

export async function pinJoinAction(input: PinJoinInput): Promise<PinResult> {
  return joinWithPin(input, await getLang());
}

export async function changeMyPinAction(input: ChangePinInput): Promise<PinResult> {
  return changeOwnPin(input, await getLang());
}

/** Switch the signed-in email account to PIN sign-in (or set a new PIN after an email-link sign-in). Always acts on the caller's own account. */
export async function setUpMyPinAction(input: PinSetupInput): Promise<PinResult> {
  return setUpOwnPin(input, await getLang());
}

const profileIdSchema = z.object({ profileId: z.string().uuid() });

/** A new random 4-digit PIN for a PIN-login member, shown ONCE to the admin. */
export async function resetMemberPin(input: { profileId: string }): Promise<MemberActionResult<{ pin: string }>> {
  const lang = await getLang();
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const parsed = profileIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("Something went wrong. Please try again.", "حدث خطأ ما. حاول مرة أخرى.") };

  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: t("Only admins can do this.", "هذا الإجراء للمشرفين فقط.") };
  const { success } = await checkLimit("generic", `reset-pin:${ctx.userId}`);
  if (!success) return { ok: false, error: t("Too many requests. Please wait a moment.", "طلبات كثيرة. انتظر قليلًا.") };

  const svc = createServiceClient();
  const { data: target } = await svc
    .from("profiles")
    .select("id, role, is_super_admin, login_method, full_name, name_key, date_of_birth")
    .eq("id", parsed.data.profileId)
    .maybeSingle();
  if (!target) return { ok: false, error: t("That member no longer exists.", "هذا العضو لم يعد موجودًا.") };

  const verdict = canActOn(callerOf({ role: "admin", is_super_admin: ctx.isSuperAdmin }), ctx.userId, "reset_pin", {
    id: target.id,
    role: target.role,
    isSuperAdmin: !!target.is_super_admin,
    loginMethod: target.login_method,
  });
  if (!verdict.ok) {
    const error =
      verdict.reason === "not_pin"
        ? t("This member signs in with email, so there is no PIN to reset.", "يسجّل هذا العضو الدخول بالبريد، فلا يوجد رمز لإعادة تعيينه.")
        : verdict.reason === "self"
          ? t("Use \"Change my PIN\" in your account menu.", "استخدم «غيّر رمزي السري» من قائمة حسابك.")
          : t("Only the owner can reset an admin's PIN.", "المالك وحده يستطيع إعادة تعيين رمز مشرف.");
    return { ok: false, error };
  }

  const pin = generateTempPin();
  const { error: pwErr } = await svc.auth.admin.updateUserById(target.id, {
    password: derivePinPassword(target.id, pin, env().SUPABASE_SERVICE_ROLE_KEY),
  });
  if (pwErr) {
    console.error("[reset-pin] update failed:", pwErr.message);
    return { ok: false, error: t("Couldn't reset the PIN. Please try again.", "تعذّرت إعادة تعيين الرمز. حاول مرة أخرى.") };
  }
  await svc.from("profiles").update({ pin_must_change: true }).eq("id", target.id);
  // Devices that remembered the old PIN start again.
  await revokeDevices(ctx.userId, target.id, "pin_reset_by_admin");
  // A reset also clears any lockout on that account (15-minute and 24-hour).
  if (target.name_key && target.date_of_birth) {
    await clearPinLockout(pinAccountLockId(target.name_key, target.date_of_birth));
  }
  await writeAudit({
    actorId: ctx.userId,
    rowId: target.id,
    operation: "update",
    before: null,
    after: { event: "pin_reset_by_admin", for: target.full_name ?? null },
  });
  revalidatePath("/admin/members");
  return { ok: true, data: { pin } };
}

/** Owner only: a fresh family PIN. The old one stops working for NEW joins; members are unaffected. */
export async function makeNewFamilyPin(): Promise<MemberActionResult<{ pin: string }>> {
  const lang = await getLang();
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const ctx = await getSuperAdminContext();
  if (!ctx) return { ok: false, error: t("Only the owner can change the family PIN.", "المالك وحده يستطيع تغيير رمز العائلة.") };
  try {
    const pin = await rotateFamilyPin(ctx.userId);
    await writeAudit({
      actorId: ctx.userId,
      rowId: null,
      tableName: "family_settings",
      operation: "update",
      before: null,
      after: { event: "family_pin_changed" },
    });
    revalidatePath("/admin/members");
    return { ok: true, data: { pin } };
  } catch (e) {
    console.error("[family-pin] rotate failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: t("Couldn't make a new family PIN. Please try again.", "تعذّر إنشاء رمز عائلة جديد. حاول مرة أخرى.") };
  }
}
