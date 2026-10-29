import { LoginClient } from "@/components/auth/LoginClient";
import { lookupRememberedDevice } from "@/lib/auth/pin-device-store";

// Never cached or prerendered: what this page shows depends on the httpOnly
// "remember this device" cookie, which only the server can read.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  let member: { firstName: string; initials: string } | null = null;
  let staleDevice = false;
  try {
    const lookup = await lookupRememberedDevice();
    if (lookup.state === "ok") member = { firstName: lookup.device.firstName, initials: lookup.device.initials };
    else if (lookup.state === "stale") staleDevice = true;
  } catch (e) {
    // The database being unreachable must not break sign-in: show the full form.
    console.error("[login] device lookup failed:", e instanceof Error ? e.message : e);
  }
  return <LoginClient member={member} staleDevice={staleDevice} />;
}
