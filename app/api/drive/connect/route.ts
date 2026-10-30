import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUrl, driveConfig } from "@/lib/drive/client";
import { getViewer } from "@/lib/timeline/viewer";

const STATE_COOKIE = "bfft_drive_state";

/** Admins only: send the browser to Google to connect the family Drive. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer(await createClient());
  if (!viewer?.isAdmin) return NextResponse.redirect(new URL("/admin?drive=forbidden", request.url));
  if (!driveConfig()) return NextResponse.redirect(new URL("/admin?drive=not-configured", request.url));

  const state = randomBytes(24).toString("base64url");
  const redirectUri = new URL("/api/drive/callback", request.url).toString();
  const res = NextResponse.redirect(authUrl(redirectUri, state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/drive",
    maxAge: 600,
  });
  return res;
}
