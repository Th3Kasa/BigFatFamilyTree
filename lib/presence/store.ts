import "server-only";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";
import { LIVE_WINDOW_MS } from "@/lib/presence/rules";

// Who is on the site right now, kept in Upstash Redis (not Postgres, so a
// heartbeat every minute costs no database write). Only a user id, a time and
// a bare pathname are kept: no IP address, no user agent. Everything ages out
// on its own within minutes:
//   live:seen          sorted set, user id → last heartbeat (ms); trimmed to
//                      the live window on every write, and the whole key
//                      expires if nobody is active
//   live:page:<id>     the page that user last reported; expires with the window

const SEEN_KEY = "live:seen";
const pageKey = (userId: string) => `live:page:${userId}`;
const WINDOW_SECONDS = Math.ceil(LIVE_WINDOW_MS / 1000);

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const e = env();
  _redis = new Redis({ url: e.UPSTASH_REDIS_REST_URL, token: e.UPSTASH_REDIS_REST_TOKEN });
  return _redis;
}

export type LiveEntry = { userId: string; lastSeen: number; path: string | null };

/** Record "this user is here, on this page". Throws if Redis is unreachable. */
export async function recordHeartbeat(userId: string, path: string | null, now = Date.now()): Promise<void> {
  const p = redis().pipeline();
  p.zadd(SEEN_KEY, { score: now, member: userId });
  p.zremrangebyscore(SEEN_KEY, "-inf", now - LIVE_WINDOW_MS);
  p.expire(SEEN_KEY, WINDOW_SECONDS * 2);
  if (path) p.set(pageKey(userId), path, { ex: WINDOW_SECONDS });
  else p.del(pageKey(userId));
  await p.exec();
}

/** Everyone seen within the live window, most recent first. Throws if Redis is unreachable. */
export async function listActive(now = Date.now()): Promise<LiveEntry[]> {
  const r = redis();
  const flat = await r.zrange<(string | number)[]>(SEEN_KEY, "+inf", now - LIVE_WINDOW_MS, {
    byScore: true,
    rev: true,
    withScores: true,
  });
  const seen: { userId: string; lastSeen: number }[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    seen.push({ userId: String(flat[i]), lastSeen: Number(flat[i + 1]) });
  }
  if (seen.length === 0) return [];

  const pages = await r.mget<(string | null)[]>(...seen.map((s) => pageKey(s.userId)));
  return seen.map((s, i) => ({ ...s, path: typeof pages[i] === "string" ? pages[i] : null }));
}
