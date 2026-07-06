import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Only needed for `drizzle-kit push`/`migrate`; `generate` does not connect.
    url: process.env.DATABASE_URL ?? "postgres://placeholder",
  },
  strict: true,
});
