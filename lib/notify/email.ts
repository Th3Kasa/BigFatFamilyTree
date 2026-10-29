import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { getDisplayName } from "@/lib/utils";
import { EMAIL_FROM, approvedEmail, newRequestEmail, newSuggestionEmail, type EmailPayload } from "./payloads";

// Optional email notifications through the Resend REST API. Everything here is
// best-effort: no RESEND_API_KEY means "skip silently", and a failure is logged
// and swallowed so it can never block the action that triggered it. The public
// functions are meant to be run with next/server's after().

function apiKey(): string | null {
  const key = process.env.RESEND_API_KEY?.trim();
  return key ? key : null;
}

export async function sendEmail(to: string[], payload: EmailPayload): Promise<void> {
  const key = apiKey();
  if (!key || to.length === 0) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error("[notify] Resend responded", res.status);
  } catch (e) {
    console.error("[notify] sending failed:", e instanceof Error ? e.message : e);
  }
}

/** Never throws. Does nothing when no API key is configured. */
async function safely(fn: () => Promise<void>): Promise<void> {
  if (!apiKey()) return;
  try {
    await fn();
  } catch (e) {
    console.error("[notify] failed:", e instanceof Error ? e.message : e);
  }
}

type Svc = ReturnType<typeof createServiceClient>;

async function adminEmails(svc: Svc): Promise<string[]> {
  const { data } = await svc.from("profiles").select("email").eq("role", "admin");
  return (data ?? []).map((r) => r.email).filter((e): e is string => !!e);
}

async function memberName(svc: Svc, profileId: string): Promise<string> {
  const { data } = await svc
    .from("profiles")
    .select("full_name, display_name, email")
    .eq("id", profileId)
    .maybeSingle();
  return data?.full_name ?? data?.display_name ?? data?.email?.split("@")[0] ?? "";
}

/** A new link request: tell every admin. */
export function notifyAdminsOfRequest(input: { profileId: string; personId: string | null }): Promise<void> {
  return safely(async () => {
    const svc = createServiceClient();
    let claimedPerson: string | null = null;
    if (input.personId) {
      const { data } = await svc
        .from("people")
        .select("given_en, given_ar, family_name_en, family_name_ar")
        .eq("id", input.personId)
        .maybeSingle();
      claimedPerson = data ? getDisplayName(data, "en") : null;
    }
    await sendEmail(
      await adminEmails(svc),
      newRequestEmail({ memberName: await memberName(svc, input.profileId), claimedPerson }),
    );
  });
}

/** A new suggested relative: tell every admin. */
export function notifyAdminsOfSuggestion(input: {
  profileId: string;
  relativeName: string;
  relation: string;
}): Promise<void> {
  return safely(async () => {
    const svc = createServiceClient();
    await sendEmail(
      await adminEmails(svc),
      newSuggestionEmail({
        memberName: await memberName(svc, input.profileId),
        relativeName: input.relativeName,
        relation: input.relation,
      }),
    );
  });
}

/** "You're in!" to the member who was just let in. */
export function notifyMemberApproved(profileId: string, lang: "ar" | "en"): Promise<void> {
  return safely(async () => {
    const svc = createServiceClient();
    const { data } = await svc
      .from("profiles")
      .select("email, full_name, display_name")
      .eq("id", profileId)
      .maybeSingle();
    if (!data?.email) return;
    await sendEmail([data.email], approvedEmail({ name: data.full_name ?? data.display_name, lang }));
  });
}
