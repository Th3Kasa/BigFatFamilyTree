import "server-only";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

/**
 * Drizzle client for the Neon database, lazily initialised so the app still
 * builds and runs on Supabase while `DATABASE_URL` is unset (during the
 * migration). Access the client via `db()`; it throws only if actually used
 * without a connection string configured.
 */
let cached: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — the Neon database is not configured yet.",
    );
  }
  cached = drizzle(neon(url), { schema });
  return cached;
}

export { schema };
