import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// First sign-in for any email in this set is auto-promoted to role='admin'.
// Idempotent on later logins (upsert).
const BOOTSTRAP_ADMIN_EMAILS = new Set<string>([
  "nadir@evosion.com.au",
]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email?.toLowerCase();
      if (user && email && BOOTSTRAP_ADMIN_EMAILS.has(email)) {
        try {
          const svc = createServiceClient();
          await svc
            .from("profiles")
            .upsert({ id: user.id, role: "admin" }, { onConflict: "id" });
        } catch (e) {
          console.error("[bootstrap admin] failed for", email, e);
        }
      }
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
