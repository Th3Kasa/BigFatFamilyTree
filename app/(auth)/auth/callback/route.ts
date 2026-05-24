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

// Supabase implicit flow sends tokens in the URL fragment (#access_token=...).
// Fragments are invisible to the server, so we return a minimal HTML page that
// reads them client-side and forwards them to /api/auth/set-session which sets
// the SSR cookies and returns the redirect destination.
const IMPLICIT_FLOW_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Signing in…</title></head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:4rem;background:#FAF8F4;color:#2D1810;">
  <p style="font-size:1rem;color:#7A5A4A;">Completing sign in — please wait…</p>
  <script>
    (function() {
      var hash = window.location.hash.slice(1);
      var p = new URLSearchParams(hash);
      var at = p.get('access_token');
      var rt = p.get('refresh_token');
      var tp = p.get('type');
      if (!at || !rt) { window.location.replace('/login?error=auth'); return; }
      fetch('/api/auth/set-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: at, refresh_token: rt, type: tp })
      })
      .then(function(r) { return r.json(); })
      .then(function(d) { window.location.replace(d.next || '/'); })
      .catch(function() { window.location.replace('/login?error=auth'); });
    })();
  </script>
</body>
</html>`;

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code       = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type       = searchParams.get("type") as EmailOtpType | null;
  const next       = searchParams.get("next") ?? "/";
  const safeNext   = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";

  const supabase = await createClient();

  // PKCE flow — OAuth, PKCE magic links, password reset
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await maybeBootstrapAdmin(supabase);
      // safeNext is /update-password for password reset (passed by login page),
      // or / for magic link and OAuth sign-in.
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
  }

  // OTP / token_hash flow — email magic links, password recovery
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      await maybeBootstrapAdmin(supabase);
      const destination = type === "recovery" ? "/update-password" : safeNext;
      return NextResponse.redirect(`${origin}${destination}`);
    }
    console.error("[auth/callback] verifyOtp failed:", error.message);
  }

  // Implicit flow (legacy Supabase config) — tokens arrive in the URL fragment.
  // The server never sees them; serve a client-side page that reads the fragment
  // and exchanges the tokens for an SSR session via /api/auth/set-session.
  if (!code && !token_hash) {
    return new NextResponse(IMPLICIT_FLOW_HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
