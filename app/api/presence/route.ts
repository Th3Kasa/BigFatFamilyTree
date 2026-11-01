import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getSignedInUserId } from "@/lib/members/auth";
import { cleanPath } from "@/lib/presence/rules";
import { recordHeartbeat } from "@/lib/presence/store";

export const dynamic = "force-dynamic";

const reply = (status: number) => new NextResponse(null, { status, headers: { "cache-control": "no-store" } });

/** A browser always sends Origin on a POST; it must name this host. */
function sameSite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (request.headers.get("host") ?? request.nextUrl.host);
  } catch {
    return false;
  }
}

/**
 * "I'm still here, on this page": sent about once a minute by an open, visible
 * tab of a signed-in member (components/shell/PresenceHeartbeat.tsx). Feeds
 * the admin Live view. Only this site's own pages may send it, and only for
 * the caller's own account.
 */
export async function POST(request: NextRequest) {
  if (!sameSite(request)) return reply(403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415);

  const auth = await getSignedInUserId();
  if (!auth) return reply(401);

  let path: string | null = null;
  try {
    const body: unknown = await request.json();
    path = cleanPath((body as { path?: unknown } | null)?.path);
  } catch {
    return reply(400);
  }

  try {
    await recordHeartbeat(auth.userId, path);
  } catch (err) {
    // Presence is a nicety: an Upstash outage must never break a page.
    console.error("[presence] heartbeat not recorded:", err instanceof Error ? err.message : err);
    return reply(503);
  }
  return reply(204);
}
