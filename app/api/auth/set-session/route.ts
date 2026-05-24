import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Receives implicit-flow tokens from the client-side fragment handler in
// /auth/callback and exchanges them for an SSR cookie session.
// Only called by our own IMPLICIT_FLOW_HTML page — not a public API.
export async function POST(request: NextRequest) {
  let body: { access_token?: string; refresh_token?: string; type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { access_token, refresh_token, type } = body;

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: "missing tokens" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });

  if (error) {
    console.error("[api/auth/set-session] setSession failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  const next = type === "recovery" ? "/update-password" : "/";
  return NextResponse.json({ next });
}
