import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeConnection, DriveError } from "@/lib/drive/client";
import { getViewer } from "@/lib/timeline/viewer";

const STATE_COOKIE = "bfft_drive_state";

function sameState(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Google sends the admin back here after they allow (or refuse) Drive access. */
export async function GET(request: NextRequest) {
  const back = (status: string) => {
    const res = NextResponse.redirect(new URL(`/admin?drive=${status}`, request.url));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/drive" });
    return res;
  };

  const params = request.nextUrl.searchParams;
  if (!sameState(params.get("state"), request.cookies.get(STATE_COOKIE)?.value)) return back("expired");
  if (params.get("error")) return back("cancelled");
  const code = params.get("code");
  if (!code) return back("cancelled");

  const viewer = await getViewer(await createClient());
  if (!viewer?.isAdmin) return back("forbidden");

  try {
    await completeConnection(code, new URL("/api/drive/callback", request.url).toString(), viewer.userId);
    return back("connected");
  } catch (e) {
    console.error("[drive] connect failed:", e instanceof Error ? e.message : e);
    return back(e instanceof DriveError && e.status === 400 ? "missing-permission" : "failed");
  }
}
