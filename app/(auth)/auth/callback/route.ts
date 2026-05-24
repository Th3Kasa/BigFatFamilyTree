import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isBootstrapAdmin } from "@/lib/auth/bootstrap";
import type { EmailOtpType } from "@supabase/supabase-js";

async function maybeBootstrapAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (user && isBootstrapAdmin(user.email)) {
    try {
      const svc = createServiceClient();
      await svc.from("profiles").upsert({ id: user.id, role: "admin" }, { onConflict: "id" });
    } catch (e) {
      console.error("[bootstrap admin] failed for", user.email, e);
    }
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code       = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type       = searchParams.get("type") as EmailOtpType | null;
  const next       = searchParams.get("next") ?? "/";
  const safeNext   = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";

  const supabase = await createClient();

  // ── PKCE flow (OAuth, PKCE-based magic links) ────────────────────────────
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await maybeBootstrapAdmin(supabase);
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  // ── OTP / token_hash flow (email magic links, password recovery) ─────────
  // Supabase sends token_hash + type in the email link. This must be verified
  // with verifyOtp before the session is established.
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      await maybeBootstrapAdmin(supabase);
      // Recovery links drop the user on the update-password page so they can
      // set a new password while the session is active.
      const destination = type === "recovery" ? "/update-password" : safeNext;
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
