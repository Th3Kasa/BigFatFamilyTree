import { z } from "zod";

export const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  BOOTSTRAP_ADMIN_CREDENTIALS: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url(),

  // Neon + Better Auth + R2 migration — optional until cutover (see
  // docs/NEON_MIGRATION.md), so the app keeps running on Supabase meanwhile.
  DATABASE_URL: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),
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
