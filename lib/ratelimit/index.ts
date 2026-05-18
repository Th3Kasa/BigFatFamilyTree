import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

const redis = new Redis({
  url: env().UPSTASH_REDIS_REST_URL,
  token: env().UPSTASH_REDIS_REST_TOKEN,
});

export const limiters = {
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
} as const;

export type LimiterKey = keyof typeof limiters;

export async function checkLimit(key: LimiterKey, identifier: string) {
  const { success, limit, remaining, reset } = await limiters[key].limit(identifier);
  return { success, limit, remaining, reset };
}
