import "server-only";
import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/members/auth";
import { loadLiveSnapshot } from "@/lib/presence/live";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/**
 * Who is on the site right now, for the admin Live view (polled every few
 * seconds). Admins only, checked on every call; anyone else gets a 404 so the
 * route reveals nothing.
 */
export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  try {
    const snapshot = await loadLiveSnapshot(ctx);
    return NextResponse.json(snapshot, { headers: NO_STORE });
  } catch (err) {
    console.error("[admin/live] unavailable:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
