import { z } from "zod";

export const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  BOOTSTRAP_ADMIN_CREDENTIALS: z.string().optional(),
  // Optional: when set, admins are emailed about new requests and members about
  // approval (lib/notify). Without it notifications are skipped silently.
  // (An empty value counts as unset; it must never fail env validation.)
  RESEND_API_KEY: z.string().optional(),
  // Informational only; nothing reads it. Optional so a missing value in one
  // Vercel environment can't fail every request in middleware.
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      "Invalid environment variables: " + JSON.stringify(parsed.error.flatten().fieldErrors),
    );
  }
  cached = parsed.data;
  return cached;
}
