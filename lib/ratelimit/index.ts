import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

let _limiters: {
  auth: Ratelimit;
  extraction: Ratelimit;
  upload: Ratelimit;
  generic: Ratelimit;
  pinIp: Ratelimit;
  pinFail: Ratelimit;
  pinFailDay: Ratelimit;
  pinFirst: Ratelimit;
  pinFirstDay: Ratelimit;
  familyPin: Ratelimit;
  pinJoin: Ratelimit;
} | null = null;

function getLimiters() {
  if (_limiters) return _limiters;
  const e = env();
  const redis = new Redis({
    url: e.UPSTASH_REDIS_REST_URL,
    token: e.UPSTASH_REDIS_REST_TOKEN,
  });
  _limiters = {
    auth: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, "1 m"), prefix: "rl:auth" }),
    extraction: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "rl:extract",
    }),
    upload: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 h"),
      prefix: "rl:upload",
    }),
    generic: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "rl:gen",
    }),
    // PIN sign-in (lib/auth/pin-session.ts). pinFail / pinFailDay count tries
    // per account (consumed BEFORE the attempt, reset on success): 5 in 15
    // minutes locks it for the rest of the window; 10 in 24 hours locks it for
    // the rest of the day (an admin's Reset PIN clears both).
    pinIp: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "15 m"), prefix: "rl:pin-ip" }),
    pinFail: new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(5, "15 m"), prefix: "rl:pin-fail" }),
    pinFailDay: new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(10, "24 h"), prefix: "rl:pin-fail-day" }),
    // Sign-in by first name + PIN: a first name alone is guessable, so tries are
    // also capped per normalised first name (20 / 15 minutes, 50 / day), before
    // the account is even resolved. Never reset on success.
    pinFirst: new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(20, "15 m"), prefix: "rl:pin-first" }),
    pinFirstDay: new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(50, "24 h"), prefix: "rl:pin-first-day" }),
    familyPin: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "1 h"), prefix: "rl:family-pin" }),
    // Accounts created per IP (join), taken just before the account is created.
    pinJoin: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 h"), prefix: "rl:pin-join" }),
  };
  return _limiters;
}

export const limiters = new Proxy({} as ReturnType<typeof getLimiters>, {
  get(_t, prop: string) {
    return getLimiters()[prop as keyof ReturnType<typeof getLimiters>];
  },
});

export type LimiterKey = keyof ReturnType<typeof getLimiters>;

// Fails open: if Upstash is unreachable (outage, or a free-tier database
// deleted for inactivity) the request is allowed and the error logged, rather
// than taking down every route that is rate limited. Supabase Auth applies its
// own sign-in rate limits, so auth stays protected meanwhile.
export async function checkLimit(key: LimiterKey, identifier: string) {
  try {
    const { success, limit, remaining, reset } = await getLimiters()[key].limit(identifier);
    return { success, limit, remaining, reset };
  } catch (err) {
    console.error(`[ratelimit] "${key}" check failed; allowing request`, err);
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }
}

// ── fail-closed variants, for credentials ────────────────────────────────────
// A PIN is only 4 digits, so unlike checkLimit() these REFUSE when Upstash is
// unreachable: no counter, no attempt. Callers show a friendly "try again shortly".

export type StrictResult = { success: boolean; unavailable: boolean; reset: number; remaining: number };

/** Consume one token. Fails closed. */
export async function checkLimitStrict(key: LimiterKey, identifier: string): Promise<StrictResult> {
  try {
    const { success, reset, remaining } = await getLimiters()[key].limit(identifier);
    return { success, unavailable: false, reset, remaining };
  } catch (err) {
    console.error(`[ratelimit] "${key}" unavailable; refusing`, err instanceof Error ? err.message : err);
    return { success: false, unavailable: true, reset: 0, remaining: 0 };
  }
}

/** Read how many tokens are left WITHOUT consuming one. Fails closed. */
export async function remainingStrict(
  key: LimiterKey,
  identifier: string,
): Promise<{ remaining: number; reset: number; unavailable: boolean }> {
  try {
    const { remaining, reset } = await getLimiters()[key].getRemaining(identifier);
    return { remaining, reset, unavailable: false };
  } catch (err) {
    console.error(`[ratelimit] "${key}" unavailable; refusing`, err instanceof Error ? err.message : err);
    return { remaining: 0, reset: 0, unavailable: true };
  }
}

/** Forget an identifier's counter (a successful sign-in clears its failed tries). Best effort. */
export async function resetLimit(key: LimiterKey, identifier: string): Promise<void> {
  try {
    await getLimiters()[key].resetUsedTokens(identifier);
  } catch (err) {
    console.error(`[ratelimit] "${key}" reset failed`, err instanceof Error ? err.message : err);
  }
}
