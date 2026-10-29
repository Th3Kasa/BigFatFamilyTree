import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { forgetCurrentDevice } from "@/lib/auth/pin-device-store";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Signing out also forgets "remember this device" here: the next person to
  // use this browser sees the full sign-in form, not "Welcome back".
  await forgetCurrentDevice();
  const origin = request.nextUrl.origin;
  return NextResponse.redirect(`${origin}/login`, { status: 302 });
}
