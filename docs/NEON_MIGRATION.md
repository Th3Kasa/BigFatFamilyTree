# Migration: Supabase → Neon + Better Auth + Cloudflare R2

## Why

Supabase's free plan allows **2 active projects per account** (across all orgs);
this app would be a third. Rather than pay for Pro, we move to a free,
scalable, vendor-independent stack:

| Concern | Was (Supabase) | Now |
|---|---|---|
| Database | Supabase Postgres | **Neon** serverless Postgres (free, autoscaling, scales to zero) |
| Query layer | `@supabase/supabase-js` | **Drizzle ORM** + `@neondatabase/serverless` |
| Auth | Supabase GoTrue (magic link + password) | **Better Auth** — email + **password only** (no email provider needed) |
| Authorization | Postgres RLS (`auth.uid()`) | **App-layer** `requireRole()` in server actions/components |
| File storage | Supabase Storage (photos, audio) | **Cloudflare R2** (10 GB free, zero egress) via presigned URLs |
| Rate limiting | Upstash Redis | unchanged (already free) |

Decisions locked in with the owner: **password-only sign-in** (admins manage
users; no magic link, so no email service required), **Drizzle**, **app-layer
authorization**, media on **R2**.

## What you provision (all free; you set the values, they are never shared in chat)

Create the accounts and set these in Vercel **and** a local `.env` (git-ignored).
The app keeps running on Supabase until the final cutover, so these can be
added ahead of time without breaking anything (they're optional in `lib/env.ts`
until Phase 5).

| Env var | From | Notes |
|---|---|---|
| `DATABASE_URL` | Neon → project → Connection string (pooled) | no credit card |
| `R2_ACCOUNT_ID` | Cloudflare → R2 | ⚠️ R2 needs a card on file even at $0 |
| `R2_ACCESS_KEY_ID` | Cloudflare → R2 → API token | |
| `R2_SECRET_ACCESS_KEY` | Cloudflare → R2 → API token | |
| `R2_BUCKET` | Cloudflare → R2 → your bucket name | e.g. `bft-media` |
| `R2_PUBLIC_URL` | R2 bucket public dev URL (for photos) | audio uses signed URLs instead |
| `BETTER_AUTH_SECRET` | generate: `openssl rand -base64 32` | |
| `BETTER_AUTH_URL` | your deployment URL | e.g. `https://…vercel.app` |

## Phases (each an independently shippable PR; app works throughout)

1. **DB foundation (additive)** — Drizzle schema mirroring the current tables,
   Neon client, config, generated SQL. Nothing switches off Supabase.
   Files: `lib/db/schema.ts`, `lib/db/drizzle.ts`, `drizzle.config.ts`, `drizzle/`.
2. **Reads → Drizzle** — point read call-sites (`app/page.tsx`, `app/person/*`,
   `app/transcripts/*`, `app/admin/*`, `components/ui/search-bar.tsx`) at Neon.
   Writes stay on Supabase.
3. **Auth → Better Auth** — email+password + admin plugin (roles) with tables in
   Neon; `lib/auth/policy.ts` (`requireUser`/`requireRole`) replaces RLS;
   rewrite `app/(auth)/*`, `middleware.ts`, admin user management. Guest
   read-only mode no longer needs the service client (just query Neon).
4. **Storage → R2** — presigned PUT/GET; rewire `PhotoUpload`,
   `AvatarPhotoUpload`, `AudioUpload`; wire the (currently unbuilt) signed audio
   playback; one-time media copy from Supabase Storage.
5. **Writes → Drizzle + cutover** — move all server-action writes to Neon;
   migrate data (adapt `scripts/copy-supabase-data.mjs` for Supabase→Neon);
   flip env vars; delete `@supabase/*`, `lib/supabase/*`, RLS/service code.

## Authorization model (replaces RLS)

RLS enforced `role in ('admin','editor')` for writes and "signed in" for reads,
keyed on `auth.uid()`. With Better Auth there is no `auth.uid()` in Postgres, so
we enforce in the app: every mutating server action calls `requireRole('editor')`
first. This is equivalent in practice because **all writes already go through
server actions** and the Neon connection string never reaches the client (unlike
the Supabase anon key). Guests reading the public tree query Neon directly for
the read-only "card" columns.

## Schema notes for Neon

- Drop the `auth.users` FK and `handle_new_user()` trigger — Better Auth owns the
  user table. `profiles.role` becomes a `role` field on Better Auth's `user`.
- Keep enums, `set_updated_at`, and the app tables as-is.
- `person_groups` materialized view and `audit_log` are currently unused by the
  UI (see the site audit) — port later or drop.
- Author columns (`events.contributed_by`, `transcripts.uploaded_by`,
  `extraction_proposals.reviewed_by`) referenced Supabase profiles; they become
  nullable text referencing the Better Auth user id (old ids won't survive the
  auth migration, so they're re-pointed/cleared on data copy).

## Media caveat

Existing `photo_url` / `audio_url` values point at Supabase Storage. Until Phase 4
copies media into R2 and rewrites URLs, keep the source Supabase project alive so
images/audio keep loading.
