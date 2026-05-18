# Big Fat Family Tree — Design Spec

**Date:** 2026-05-18
**Repo:** https://github.com/Th3Kasa/BigFatFamilyTree
**Deployment:** Vercel (private, behind auth)
**Seed/focal person:** Marcelle Gaballah Shahata El Zawaty (Grandma)

## 1. Purpose

A dynamic, bilingual (Arabic/English) family tree web app that captures and preserves the family knowledge held by Grandma Marcelle — a story-driven Egyptian Arabic speaker — and grows as trusted family members contribute. Source-of-truth for stories, names, dates, relationships, photos, and original audio. Designed to be extended later into a printable book (PDF) and a GEDCOM-compatible export.

## 2. Goals & non-goals

**Goals**
- Capture grandma's stories as audio + Arabic transcripts, extract structured family data with Claude, review before commit.
- Render a dynamic, interactive tree that handles real Egyptian family structures: polygamy, remarriage, cousin marriage, partial/unknown people, fuzzy dates.
- Bilingual UI (Arabic primary, English toggle) with proper RTL/LTR handling.
- Invite-only, family-only access — no public read.
- Underlying data model GEDCOM-compatible so a book/export path is easy later.

**Non-goals (v1)**
- Public-facing site, SEO, social sharing.
- Mobile native app (responsive web only).
- Automatic GEDCOM export, PDF book generator (data model supports both, but not built v1).
- DNA/ancestry integrations.

## 3. Users & roles

| Role | Powers |
|---|---|
| **admin** | Everything an editor can do, plus invite/promote/revoke users and view the audit log. Only role that can manage users. |
| **editor** | Add/edit/delete any person, event, story, photo. Edit grandma-sourced stories. Approve Claude extraction proposals. Cannot manage users or view audit. |
| **viewer** | Read-only. See the tree, profiles, stories, photos. |

User management (invite, role change, revoke) is **admin-only**. No self-signup. Magic-link auth only.

## 4. Data model

Postgres on Supabase. All tables have RLS enabled.

### `people`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| given_ar, given_en | text | Display name = `given + family_name` in current locale |
| father_name_ar, father_name_en | text | |
| grandfather_name_ar, grandfather_name_en | text | |
| great_grandfather_name_ar, great_grandfather_name_en | text nullable | |
| family_name_ar, family_name_en | text | |
| gender | enum `m` / `f` / `unknown` | |
| father_id | uuid fk people nullable | Drives Major/Minor group derivation |
| mother_id | uuid fk people nullable | |
| is_placeholder | bool default false | "Unnamed brother who died young" |
| photo_url | text nullable | Supabase Storage signed URL |
| notes_ar, notes_en | text | Free text bio not tied to an event |
| deleted_at | timestamptz nullable | Soft delete |
| created_at, updated_at | timestamptz | |

Asymmetric translation rule: Arabic names get English transliterations; pure English names stay English-only. Display falls back to whichever language is populated.

### `events`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| person_id | uuid fk people | |
| type | enum | `birth`, `death`, `marriage`, `divorce`, `engagement`, `migration`, `education`, `notable_story`, `custom` |
| custom_label | text nullable | When `type = custom` |
| date_value | date nullable | |
| date_precision | enum | `exact`, `year`, `decade`, `before`, `after`, `around` |
| location | text nullable | |
| story_ar, story_en | text | Free text narrative |
| audio_url | text nullable | Linked recording, often timestamp-anchored to a transcript segment |
| source_transcript_id | uuid fk transcripts nullable | |
| source_type | enum | `grandma_transcript`, `family_contribution`, `document`, `admin` — informational only (shows mic icon for grandma-sourced); not a permission gate |
| contributed_by | uuid fk profiles | Audit / display only |
| created_at, updated_at | timestamptz | |

### `relationships`
For non-parental links (parental links live on `people.father_id` / `people.mother_id`).

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| type | enum | `spouse`, `adopted_by`, `raised_by`, `godparent` |
| person_a_id, person_b_id | uuid fk people | |
| start_date, end_date | date nullable | |
| status | enum | `current`, `divorced`, `widowed` (spouse only) |
| order_index | int | For polygamy: which marriage (1st, 2nd, …) |

### `transcripts`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| audio_url | text | Supabase Storage |
| raw_text_ar | text | Whisper output |
| segments | jsonb | `[{start, end, text}]` for audio scrubber sync |
| recorded_at | date | |
| recorded_with | uuid fk people | Usually Marcelle |
| uploaded_by | uuid fk profiles | |
| created_at | timestamptz | |

### `extraction_proposals`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| transcript_id | uuid fk transcripts | |
| proposed_changes | jsonb | Structured list: new people, new events, new relationships, dedup links to existing people |
| confidence_notes | jsonb | Items flagged for human attention |
| status | enum | `pending`, `approved`, `rejected` |
| reviewed_by | uuid fk profiles nullable | |
| reviewed_at | timestamptz nullable | |
| created_at | timestamptz | |

### `profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk = auth.uid() | |
| display_name | text | |
| role | enum | `admin`, `editor`, `viewer` |
| invited_by | uuid fk profiles nullable | |
| created_at | timestamptz | |

### `audit_log`
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| actor_id | uuid fk profiles | |
| table_name | text | |
| row_id | uuid | |
| operation | enum | `insert`, `update`, `delete` |
| before, after | jsonb | |
| created_at | timestamptz | |

### `settings`
Single-row table. `focal_person_id` → default radial centering + home view focus. Editable by admin.

### Edge cases the model handles
- **Polygamy** — multiple `relationships` rows of type `spouse` with `order_index`.
- **Remarriage** — sequential spouse rows with `start_date`/`end_date`/`status`.
- **Cousin marriage** — one `people` row appears at one tree position; a `spouse` relationship connects them to a cousin already in the tree; the graph renderer draws both edges.
- **Unknown/partial people** — `is_placeholder = true`, names may be null.
- **Fuzzy dates** — `date_precision` enum + nullable `date_value`.
- **Adoption / raised-by** — distinct `relationships.type` values from biological parents on `people`.
- **Godparents** — `relationships.type = godparent`.

## 5. Major/Minor group derivation

Implemented as a Postgres view (materialized, refreshed on write via trigger).

- **Major group** = `family_name_ar` of the patrilineal root (walk `father_id` up until null). Every descendant inherits.
- **Minor group** = formed when a person's `family_name_ar` differs from their father's. They become the root of a new Minor branch.
- **Color assignment** = deterministic hash of Major group name → palette slot. Minor branches use tinted shades of their Major.
- **Orphans** = no `father_id` and no children referencing them → "Unlinked" group, greyed out.
- **Dynamic** — adding ancestors shifts the Major root upward automatically; adding new cousin branches surfaces new Major groups in the legend.

Marcelle is the **seed person** (first row) and the **default focal person** (from `settings.focal_person_id`). Architecturally not special — when her father, grandfather, etc. get added, the derivation walks higher and the visible root moves up.

## 6. Capture & extraction workflow

```
[1] Record grandma (.m4a / .mp3) on phone
[2] Drop file into /recordings/ on PC (gitignored)
[3] npm run transcribe
      → scripts/transcribe.py uses faster-whisper large-v3 (language="ar")
      → outputs /transcripts/<file>.txt + JSON with segment timestamps
[4] App: /admin/transcripts/new → upload audio + paste text
      → audio → Supabase Storage (private bucket)
      → transcripts row created
[5] Click "Extract"
      → Edge Function calls Claude Haiku
      → low-confidence items re-run through Sonnet
      → result saved as extraction_proposal (jsonb)
[6] /admin/review/<proposal_id>
      → Arabic transcript with audio scrubber synced to segments (left)
      → proposed people / events / edges (right), each ✓ / ✎ / ✗
      → dedup: link a proposed person to an existing one
[7] Approve → writes to people/events/relationships → tree updates live
```

**Rationale**
- `faster-whisper` large-v3 local = $0 + best Egyptian dialect accuracy.
- Haiku-first / Sonnet-on-ambiguity = cost-controlled extraction.
- Review inbox = nothing enters tree without human approval.
- Audio kept + timestamp-anchored = grandma's voice preserved alongside text.
- Dedup linking prevents "three different Uncle Mina" duplicates.

## 7. UI & visualization

### Routes
```
/login                  Magic-link auth
/                       Force-directed graph (home)
/person/[id]            Profile: full name chain, timeline, family, photos, sources
/focus/[id]             Radial sunburst centered on person
/admin/transcripts      List
/admin/transcripts/new  Upload + paste
/admin/review           Extraction proposal inbox
/admin/users            Invite / manage (admin only)
/admin/audit            Audit log (admin only)
/settings               Language, focal person, theme
```

### Force graph (home)
- `react-flow` with custom `PersonNode` (photo or colored initial; ring color = Major group; ring tint = Minor).
- Edges: solid = parent-child, dashed = spouse, dotted = godparent / raised-by.
- Polygamy: spouse edges fan out from the husband, labeled by `order_index`.
- Cousin marriage: spouse edge connects two existing nodes in the tree naturally.
- Pan/zoom/drag; search top-right; legend bottom-left (toggle Major groups on/off); language toggle top-right.
- Click node → side drawer (quick info, Open profile, Focus mode buttons).

### Radial focus mode
- D3 sunburst, focal person at center.
- Ancestors radiate up-and-out one hemisphere; descendants down-and-out the other.
- Click any ring person → smooth re-center transition.

### Profile page
- Header: photo, given + family_name (large, current locale), full chain (smaller, both languages).
- Tabs: **Timeline** (events chronological, story text + audio players synced to transcript segments), **Family** (parents/spouses/children/siblings clickable), **Photos**, **Sources** (linked transcripts).
- Edit buttons: visible to admin + editor; hidden for viewer.

### Bilingual & RTL
- `next-intl`, locale stored on profile + URL prefix (`/ar/...`, `/en/...`).
- `dir="rtl"` on `<html>` when AR; Tailwind logical properties (`ms-`, `me-`, `ps-`, `pe-`) throughout.
- Names render in current locale, fall back to whichever language has a value (no `[no translation]` placeholders).
- Stories render Arabic by default; English toggle pill shown only if translation exists.

### Mobile
- Force graph hard on small screens → mobile default is **list view** grouped by Major family, expandable per generation.
- "View graph" button opens full-screen zoomable modal.

### Edit UX (admin + editor are equivalent here)
- Every edit happens inline on the profile/graph — no separate "admin panel" for content.
- All writes are direct (no proposal queue for editors anymore).
- `audit_log` records actor, before/after — admin can spot and revert any change.
- Soft-delete only (`deleted_at`); recoverable from audit.
- `extraction_proposals` queue remains for Claude's output from transcripts — admins + editors both review.

## 8. Security

### Secrets
- Anthropic, Supabase service-role, Upstash keys in `.env.local` (gitignored) for dev; Vercel project env vars for prod.
- `.env.example` committed with placeholders + comments.
- `NEXT_PUBLIC_*` only for Supabase anon URL + key (safe; RLS enforces real access).
- Service-role key used only in Edge Functions / server actions; never imported into client components.
- Pre-commit hook (`gitleaks`) blocks accidental key commits.

### Auth & access
- Supabase Auth, magic-link only (no passwords).
- `middleware.ts` redirects unauthenticated requests to `/login` for every route except `/login` and `/auth/callback` — no public read.
- Session cookies: `httpOnly`, `secure`, `sameSite=lax`.
- Sign-out clears server + client session.

### Row Level Security
Enabled on **every** table.
- `people`, `events`, `relationships`, `transcripts`: SELECT requires `auth.uid()` present.
- INSERT/UPDATE/DELETE: gated by `profiles.role IN ('admin', 'editor')`.
- `extraction_proposals`: any authenticated; only admins + editors update status.
- `profiles`: user sees own row; admin sees all; only admin updates `role`.
- `audit_log`: admin SELECT only; inserted by triggers, not directly writable.
- `settings`: SELECT for all authenticated; UPDATE admin only.
- Storage buckets (`photos`, `audio`): private; signed URLs server-generated, short TTL (≤1 hour).

### Input validation & sanitisation
- `zod` schemas on every server action / Edge Function input — reject malformed payloads before DB.
- User text rendered via React (auto-escaped); never `dangerouslySetInnerHTML`.
- If markdown ever rendered in stories: `rehype-sanitize` with strict allowlist.
- File uploads: MIME sniff + extension check + max size (10MB photo, 100MB audio); reject otherwise.
- Filenames sanitised + UUID-prefixed before storage (no path traversal).

### Rate limiting (Upstash Redis + `@upstash/ratelimit` middleware)
| Endpoint | Limit |
|---|---|
| Auth (magic link) | 5 / min / IP |
| Extraction (Claude calls) | 10 / hour / user |
| Transcript upload | 20 / hour / user |
| Generic API | 60 / min / user |

Returns 429 with `Retry-After` on breach.

### CSRF & CORS
- Server actions (built-in CSRF) used for all mutations — not raw API routes.
- CORS: same-origin only. Any cross-origin API route gets explicit allowlist (no `*`).

### Security headers (`next.config.js` + middleware)
- `Content-Security-Policy`: strict — `default-src 'self'`, Supabase + Vercel + Upstash domains allowlisted.
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, restrictive `Permissions-Policy`.

### Audit & dependencies
- `audit_log` table — every write logged via DB triggers. Admin view at `/admin/audit`.
- Dependabot on the GitHub repo.
- `npm audit` in CI; fail build on high/critical.

### Privacy
- Living minors (`birth_year > today - 18`): photos hidden from `viewer` by default; admin can override per-person.
- Admin "forget me" action: scrubs a person to placeholder (keeps tree structure, removes name/photo/stories).

## 9. Tech stack

- **Framework:** Next.js 15 (App Router), TypeScript
- **Styling:** Tailwind CSS + shadcn/ui (with RTL plugin)
- **Auth + DB + Storage:** Supabase (project already exists, MCP-connected)
- **Graph:** `react-flow` (force-directed); `d3-hierarchy` (radial sunburst)
- **i18n:** `next-intl`
- **Validation:** `zod`
- **Rate limiting:** `@upstash/ratelimit` + Upstash Redis
- **Transcription:** Python `faster-whisper` large-v3 (local, free)
- **Extraction:** `@anthropic-ai/sdk` — Haiku default, Sonnet for low-confidence items
- **Deployment:** Vercel (main → prod, PR previews)

## 10. Repo layout

```
/app                     Next.js App Router
  /(auth)/login
  /(app)/                authenticated routes
    page.tsx             force graph (home)
    person/[id]/page.tsx
    focus/[id]/page.tsx
    admin/...
  /api/...               server-only routes (signed URLs, etc.)
/components              UI primitives + custom (PersonNode, RadialTree, Timeline, etc.)
/lib
  supabase/              client, server, middleware helpers
  i18n/                  next-intl config
  graph/                 group derivation, layout helpers
  validation/            zod schemas
  ratelimit/             upstash wrappers
/supabase
  migrations/            versioned SQL
  seed.sql               Marcelle + immediate family
  functions/             Edge Functions (extract-entities, sign-url)
/scripts
  transcribe.py          faster-whisper CLI
  requirements.txt
/recordings              gitignored — local audio drop
/transcripts             gitignored — Whisper output
/messages
  ar.json
  en.json
/docs/superpowers/specs  design docs
/.env.example
/middleware.ts
```

## 11. Deployment

- Vercel project linked to `main`; preview deploys per PR.
- Env vars in Vercel dashboard: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- Supabase migrations applied via Supabase MCP (`apply_migration`) or CLI.
- Custom domain optional; Vercel subdomain fine for v1.

## 12. Milestones

Each milestone becomes its own implementation plan + PR.

1. **Foundation** — Next.js scaffold, Supabase wiring, auth + middleware, RLS skeleton, `.env.example`, security headers, rate limiting setup.
2. **Data model + seed** — migrations for all tables + RLS policies, group-derivation view + trigger, seed Marcelle + immediate family.
3. **Read-only graph** — force graph rendering from real data, profile page, AR/EN toggle + RTL, mobile list view.
4. **People & events CRUD** — add/edit/delete people, add events, photo upload, audit log triggers.
5. **Radial focus mode** — D3 sunburst, focal-person setting.
6. **Transcription pipeline** — `transcribe.py`, transcript upload UI, audio storage + signed URLs, segment-synced audio scrubber.
7. **Claude extraction + review inbox** — Edge Function, proposal UI, dedup linking.
8. **User management** — invite, role changes, audit view (admin only).
9. **Polish** — privacy toggles, "forget me", Dependabot, CI, accessibility pass.

Each milestone is independently shippable behind login.

## 13. Open questions / deferred

- **Photo storage scale** — Supabase free tier is 1GB; revisit if photos grow large.
- **Backup strategy** — Supabase has PITR on paid tier; for free tier, set up a scheduled `pg_dump` to a personal bucket.
- **Video** — not v1; data model can accommodate by adding `media` table later.
- **GEDCOM export** — model is compatible; build when needed.
- **Printable book / PDF** — generate from same data via React PDF or LaTeX template; v2.
