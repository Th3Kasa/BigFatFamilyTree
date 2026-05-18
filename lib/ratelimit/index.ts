import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

let _limiters: {
  auth: Ratelimit;
  extraction: Ratelimit;
  upload: Ratelimit;
  generic: Ratelimit;
} | null = null;

function getLimiters() {
  if (_limiters) return _limiters;
  const e = env();
  const redis = new Redis({
    url: e.UPSTASH_REDIS_REST_URL,
    token: e.UPSTASH_REDIS_REST_TOKEN,
  });
  _limiters = {
    auth: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 m"), prefix: "rl:auth" }),
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
  };
  return _limiters;
}

export const limiters = new Proxy({} as ReturnType<typeof getLimiters>, {
  get(_t, prop: string) {
    return getLimiters()[prop as keyof ReturnType<typeof getLimiters>];
  },
});

export type LimiterKey = keyof ReturnType<typeof getLimiters>;

export async function checkLimit(key: LimiterKey, identifier: string) {
  const { success, limit, remaining, reset } = await getLimiters()[key].limit(identifier);
  return { success, limit, remaining, reset };
}
