import "server-only";
import type { AdminContext } from "@/lib/members/auth";
import { listActive } from "@/lib/presence/store";

export type LiveMember = {
  userId: string;
  name: string;
  lastSeen: number;
  path: string | null;
  isYou: boolean;
};

export type LiveSnapshot = { now: number; members: LiveMember[] };

/**
 * Signed-in members active in the live window, with their names. Admins only:
 * the caller passes the context from getAdminContext(), and the names are read
 * with that admin's own session, so profiles RLS applies as well.
 * Throws if the presence store is unreachable.
 */
export async function loadLiveSnapshot(ctx: AdminContext, now = Date.now()): Promise<LiveSnapshot> {
  const entries = await listActive(now);
  if (entries.length === 0) return { now, members: [] };

  const { data, error } = await ctx.supabase
    .from("profiles")
    .select("id, full_name, display_name")
    .in(
      "id",
      entries.map((e) => e.userId),
    );
  if (error) throw new Error(`profiles lookup failed: ${error.message}`);

  const names = new Map((data ?? []).map((p) => [p.id, p.full_name ?? p.display_name ?? null]));
  // An id with no profile row (account since deleted) is not shown.
  const members = entries
    .filter((e) => names.has(e.userId))
    .map((e) => ({
      userId: e.userId,
      name: names.get(e.userId)?.trim() || "—",
      lastSeen: e.lastSeen,
      path: e.path,
      isYou: e.userId === ctx.userId,
    }));
  return { now, members };
}
