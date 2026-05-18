# Milestone 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a deployable Next.js + Supabase app where an invited admin can magic-link log in, hit an authenticated home page, and every security baseline (RLS, rate limiting, headers, secrets hygiene) is in place before any family data exists.

**Architecture:** Next.js 15 App Router with TypeScript and Tailwind on Vercel. Supabase provides Postgres + Auth + Storage; access via SSR helpers (`@supabase/ssr`) on the server and the anon client in the browser. Middleware enforces auth and applies security headers + rate limiting (Upstash Redis). One root-level `profiles` table seeded with the first admin establishes the role model used by every later migration.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui (later), Supabase (Postgres + Auth + Storage), `@supabase/ssr`, `next-intl`, `zod`, Upstash Redis + `@upstash/ratelimit`, Vercel.

**Prerequisites:**
- Node 20+, npm, Python 3.10+ (for later milestones; not used in this one).
- Supabase project exists and is reachable via Supabase MCP.
- Upstash Redis database (free tier) — create at https://upstash.com if not already.
- Vercel CLI installed (`npm i -g vercel`) — optional for local previews.
- Repo already initialised with the design spec committed (done).

**Reference spec:** [docs/superpowers/specs/2026-05-18-big-fat-family-tree-design.md](../specs/2026-05-18-big-fat-family-tree-design.md)

---

## File Structure

Files this plan creates (relative to repo root):

```
package.json
tsconfig.json
next.config.ts
postcss.config.mjs
tailwind.config.ts
.eslintrc.json
.prettierrc
.env.example
.env.local                      (gitignored — created locally by engineer)
middleware.ts
app/
  layout.tsx                    Root layout, html lang/dir
  globals.css                   Tailwind base + RTL helpers
  page.tsx                      Authenticated home (placeholder for now)
  (auth)/
    login/page.tsx              Magic-link form
    auth/callback/route.ts      Supabase auth callback
lib/
  supabase/
    client.ts                   Browser client (anon)
    server.ts                   Server-side client (cookies-based)
    service.ts                  Service-role client (server-only, locked down)
    middleware.ts               Helper to refresh session in middleware
  ratelimit/
    index.ts                    Upstash ratelimit instances per endpoint class
  validation/
    auth.ts                     zod schemas for auth inputs
  env.ts                        Typed env access with zod validation at startup
supabase/
  migrations/
    20260518000001_profiles.sql Profiles table + role enum + RLS
    20260518000002_audit_log.sql audit_log table + RLS (admin-only SELECT)
    20260518000003_settings.sql settings table (single row) + RLS
  seed.sql                      Insert first admin profile placeholder
tests/
  smoke/
    env.test.ts                 Asserts env validation rejects missing vars
    middleware.test.ts          Asserts unauth redirect logic
    ratelimit.test.ts           Asserts ratelimit wrapper rejects past limit
```

Files explicitly NOT in this milestone (deferred to later milestones): people/events/relationships tables, graph rendering, photo storage, transcription, Claude extraction, user invite UI.

---

## Task 1: Scaffold Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `tailwind.config.ts`, `.eslintrc.json`, `.prettierrc`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

- [ ] **Step 1: Initialise package.json**

Run from repo root:

```bash
npm init -y
```

Then replace `package.json` contents with:

```json
{
  "name": "big-fat-family-tree",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install next@latest react@latest react-dom@latest
npm install -D typescript @types/react @types/react-dom @types/node
npm install -D tailwindcss@latest postcss autoprefixer
npm install -D eslint eslint-config-next prettier
npm install -D vitest @vitest/ui happy-dom
```

- [ ] **Step 3: Configure TypeScript**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Configure Tailwind**

Create `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

Create `postcss.config.mjs`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

Create `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html[dir="rtl"] body { font-family: system-ui, sans-serif; }
```

- [ ] **Step 5: Create root layout + placeholder page**

Create `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Big Fat Family Tree",
  description: "Family knowledge preserved.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
```

Create `app/page.tsx`:

```tsx
export default function Home() {
  return <main className="p-8"><h1 className="text-2xl">Authenticated home</h1></main>;
}
```

- [ ] **Step 6: ESLint + Prettier**

Create `.eslintrc.json`:

```json
{ "extends": ["next/core-web-vitals", "next/typescript"] }
```

Create `.prettierrc`:

```json
{ "semi": true, "singleQuote": false, "trailingComma": "all", "printWidth": 100 }
```

- [ ] **Step 7: Verify build**

```bash
npm run build
```

Expected: build completes; `.next/` directory created; no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts tailwind.config.ts postcss.config.mjs .eslintrc.json .prettierrc app/
git commit -m "chore: scaffold Next.js 15 app with Tailwind and TS"
```

---

## Task 2: Typed environment variables with zod

**Files:**
- Create: `lib/env.ts`, `.env.example`, `tests/smoke/env.test.ts`

- [ ] **Step 1: Install zod**

```bash
npm install zod
```

- [ ] **Step 2: Write failing test**

Create `tests/smoke/env.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { envSchema } from "@/lib/env";

describe("env validation", () => {
  it("rejects when required vars are missing", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a fully populated env", () => {
    const result = envSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "redis-token",
      ANTHROPIC_API_KEY: "sk-ant-xxx",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
    expect(result.success).toBe(true);
  });
});
```

Configure vitest — create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "happy-dom", globals: false },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

- [ ] **Step 3: Run test, expect failure**

```bash
npx vitest run tests/smoke/env.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/env'`.

- [ ] **Step 4: Implement `lib/env.ts`**

```ts
import { z } from "zod";

export const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
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
```

- [ ] **Step 5: Run test, expect pass**

```bash
npx vitest run tests/smoke/env.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Create `.env.example`**

```
# Supabase (project already exists; values from Supabase dashboard → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...anon...
SUPABASE_SERVICE_ROLE_KEY=eyJ...service-role...   # server-only, never expose

# Upstash Redis (create free DB at upstash.com)
UPSTASH_REDIS_REST_URL=https://YOUR-DB.upstash.io
UPSTASH_REDIS_REST_TOKEN=YOUR_TOKEN

# Anthropic (Claude extraction; used in later milestones but validated now)
ANTHROPIC_API_KEY=sk-ant-...

# App URL (used for magic-link redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 7: Engineer creates `.env.local`**

Engineer copies `.env.example` to `.env.local` and fills real values. `.env.local` is already gitignored. Do **not** commit it.

- [ ] **Step 8: Commit**

```bash
git add lib/env.ts tests/smoke/env.test.ts vitest.config.ts .env.example package.json package-lock.json
git commit -m "feat: typed env validation with zod + .env.example"
```

---

## Task 3: Supabase migrations — profiles, audit_log, settings

**Files:**
- Create: `supabase/migrations/20260518000001_profiles.sql`, `supabase/migrations/20260518000002_audit_log.sql`, `supabase/migrations/20260518000003_settings.sql`, `supabase/seed.sql`

- [ ] **Step 1: Create profiles migration**

Create `supabase/migrations/20260518000001_profiles.sql`:

```sql
-- Roles
do $$ begin
  create type user_role as enum ('admin', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

-- Profiles: 1:1 with auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role user_role not null default 'viewer',
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user can read their own row; admins can read all.
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

create policy profiles_select_admin on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Only admins can insert/update/delete profiles (i.e. manage users).
create policy profiles_admin_write on public.profiles
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Helper: auto-create a profile row when a new auth.users row appears.
-- New users land as 'viewer'; an admin promotes them via the users page (later milestone).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), 'viewer')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 2: Create audit_log migration**

Create `supabase/migrations/20260518000002_audit_log.sql`:

```sql
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  table_name text not null,
  row_id uuid,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

-- Only admins can read. Never writable directly from the client; written by triggers.
create policy audit_log_admin_select on public.audit_log
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
```

- [ ] **Step 3: Create settings migration**

Create `supabase/migrations/20260518000003_settings.sql`:

```sql
create table if not exists public.settings (
  id int primary key check (id = 1),
  focal_person_id uuid,
  updated_at timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

alter table public.settings enable row level security;

create policy settings_select_authenticated on public.settings
  for select using (auth.role() = 'authenticated');

create policy settings_update_admin on public.settings
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
```

- [ ] **Step 4: Seed file (placeholder — engineer fills in their own UUID after first login)**

Create `supabase/seed.sql`:

```sql
-- After first magic-link login, find your auth.users.id in the Supabase dashboard
-- and run this once to promote yourself to admin:
--
-- update public.profiles set role = 'admin' where id = '<YOUR-AUTH-USER-UUID>';
--
-- This file exists for documentation; do not auto-run.
select 1;
```

- [ ] **Step 5: Apply migrations via Supabase MCP**

The engineer runs these in order using the Supabase MCP `apply_migration` tool (or via the CLI `supabase db push` if linked). The migration name passed to MCP should match the filename without the `.sql` extension:

```
apply_migration(name="20260518000001_profiles", query=<contents of file>)
apply_migration(name="20260518000002_audit_log", query=<contents of file>)
apply_migration(name="20260518000003_settings", query=<contents of file>)
```

- [ ] **Step 6: Verify migrations applied**

Use Supabase MCP `list_tables` for schema `public`. Expected: `profiles`, `audit_log`, `settings` present. RLS enabled on each (check `list_migrations` to confirm versions applied).

- [ ] **Step 7: Commit**

```bash
git add supabase/
git commit -m "feat(db): add profiles, audit_log, settings tables with RLS"
```

---

## Task 4: Supabase clients (browser, server, service-role)

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/service.ts`, `lib/supabase/middleware.ts`

- [ ] **Step 1: Install Supabase libs**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Browser client**

Create `lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

export function createClient() {
  const e = env();
  return createBrowserClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
```

- [ ] **Step 3: Server client (cookies-based)**

Create `lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function createClient() {
  const e = env();
  const cookieStore = await cookies();
  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(toSet) {
        try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* called from a Server Component; safe to ignore */ }
      },
    },
  });
}
```

- [ ] **Step 4: Service-role client (server-only, locked down)**

Create `lib/supabase/service.ts`:

```ts
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export function createServiceClient() {
  const e = env();
  return createSupabaseClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

The `server-only` import causes a build-time error if any client component imports this file.

- [ ] **Step 5: Middleware helper**

Create `lib/supabase/middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const e = env();
  const supabase = createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(toSet) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  return { response, user };
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/supabase/ package.json package-lock.json
git commit -m "feat: supabase clients (browser/server/service) and middleware helper"
```

---

## Task 5: Rate limiting with Upstash

**Files:**
- Create: `lib/ratelimit/index.ts`, `tests/smoke/ratelimit.test.ts`

- [ ] **Step 1: Install Upstash libs**

```bash
npm install @upstash/redis @upstash/ratelimit
```

- [ ] **Step 2: Write failing test**

Create `tests/smoke/ratelimit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: () => ({
    UPSTASH_REDIS_REST_URL: "https://fake.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "fake",
  }),
}));

describe("ratelimit module", () => {
  beforeEach(() => vi.resetModules());

  it("exposes named limiters", async () => {
    const mod = await import("@/lib/ratelimit");
    expect(mod.limiters.auth).toBeDefined();
    expect(mod.limiters.extraction).toBeDefined();
    expect(mod.limiters.upload).toBeDefined();
    expect(mod.limiters.generic).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test, expect fail**

```bash
npx vitest run tests/smoke/ratelimit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `lib/ratelimit/index.ts`:

```ts
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
  extraction: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "1 h"), prefix: "rl:extract" }),
  upload: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "1 h"), prefix: "rl:upload" }),
  generic: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "1 m"), prefix: "rl:gen" }),
} as const;

export type LimiterKey = keyof typeof limiters;

export async function checkLimit(key: LimiterKey, identifier: string) {
  const { success, limit, remaining, reset } = await limiters[key].limit(identifier);
  return { success, limit, remaining, reset };
}
```

- [ ] **Step 5: Run test, expect pass**

```bash
npx vitest run tests/smoke/ratelimit.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ratelimit/ tests/smoke/ratelimit.test.ts package.json package-lock.json
git commit -m "feat: upstash ratelimit module with per-endpoint limiters"
```

---

## Task 6: Middleware — auth gate, security headers, rate limit on auth

**Files:**
- Create: `middleware.ts`, `tests/smoke/middleware.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/smoke/middleware.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isPublicPath } from "@/middleware";

describe("middleware path classification", () => {
  it("classifies /login as public", () => expect(isPublicPath("/login")).toBe(true));
  it("classifies /auth/callback as public", () => expect(isPublicPath("/auth/callback")).toBe(true));
  it("classifies / as protected", () => expect(isPublicPath("/")).toBe(false));
  it("classifies /admin/users as protected", () => expect(isPublicPath("/admin/users")).toBe(false));
  it("classifies static asset paths as public", () => expect(isPublicPath("/_next/static/foo.js")).toBe(true));
});
```

- [ ] **Step 2: Run test, expect fail**

```bash
npx vitest run tests/smoke/middleware.test.ts
```

Expected: FAIL — `isPublicPath` not exported.

- [ ] **Step 3: Implement middleware**

Create `middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { checkLimit } from "@/lib/ratelimit";

const PUBLIC_PREFIXES = ["/login", "/auth/callback", "/_next", "/favicon.ico"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "."));
}

function applySecurityHeaders(res: NextResponse) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  // CSP: tightened in later milestones once external domains known.
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://*.upstash.io; font-src 'self' data:; frame-ancestors 'none'",
  );
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate-limit auth endpoints by IP before doing anything else.
  if (pathname.startsWith("/login") || pathname.startsWith("/auth/callback")) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { success } = await checkLimit("auth", ip);
    if (!success) {
      return applySecurityHeaders(new NextResponse("Too many requests", { status: 429, headers: { "Retry-After": "60" } }));
    }
  }

  const { response, user } = await updateSession(request);

  if (!isPublicPath(pathname) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  return applySecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 4: Run test, expect pass**

```bash
npx vitest run tests/smoke/middleware.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts tests/smoke/middleware.test.ts
git commit -m "feat: auth-gate middleware with security headers and auth rate limit"
```

---

## Task 7: Login page (magic link) and auth callback

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/auth/callback/route.ts`, `lib/validation/auth.ts`

- [ ] **Step 1: Validation schema**

Create `lib/validation/auth.ts`:

```ts
import { z } from "zod";

export const magicLinkSchema = z.object({
  email: z.string().email().max(254),
});

export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
```

- [ ] **Step 2: Login page**

Create `app/(auth)/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { magicLinkSchema } from "@/lib/validation/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const parsed = magicLinkSchema.safeParse({ email });
    if (!parsed.success) {
      setStatus("error");
      setErrorMsg("Enter a valid email address.");
      return;
    }
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>
      {status === "sent" ? (
        <p>Check your email for a sign-in link.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="block text-sm">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {status === "sending" ? "Sending…" : "Send magic link"}
          </button>
          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
        </form>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Auth callback route**

Create `app/(auth)/auth/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
```

- [ ] **Step 4: Verify end-to-end locally**

```bash
npm run dev
```

Open `http://localhost:3000`. Expected: redirected to `/login?next=%2F`. Enter your email, click button. Check Supabase dashboard → Authentication → Users (the row should appear) and email inbox for the magic link. Click link → redirected through `/auth/callback?code=...` → land on `/` showing "Authenticated home".

- [ ] **Step 5: Promote yourself to admin**

In Supabase SQL editor (or via MCP `execute_sql`):

```sql
update public.profiles
set role = 'admin', display_name = 'Hanan'
where id = (select id from auth.users where email = 'your-email@example.com');
```

Verify:

```sql
select id, display_name, role from public.profiles;
```

Expected: one row, role = `admin`.

- [ ] **Step 6: Commit**

```bash
git add app/ lib/validation/
git commit -m "feat: magic-link login page and auth callback route"
```

---

## Task 8: Configure auth in Supabase dashboard

Manual configuration step (no code), but documented as part of the plan so it isn't forgotten.

- [ ] **Step 1: Redirect URLs**

In Supabase dashboard → Authentication → URL Configuration:
- **Site URL:** `http://localhost:3000` (dev). When deploying, change to the Vercel production URL.
- **Redirect URLs (additional):** `http://localhost:3000/auth/callback`, plus `https://<vercel-project>.vercel.app/auth/callback` once deployed, plus any preview URLs you'll use.

- [ ] **Step 2: Disable public sign-up**

Authentication → Providers → Email:
- **Enable Email provider:** ON
- **Confirm email:** ON
- **Disable signup:** ON (only invited users via admin can be created later via service-role; this prevents random magic-link signup attempts from creating accounts)

Note: with "Disable signup" ON, `signInWithOtp` will fail for any email not already in `auth.users`. For the very first admin (you), temporarily turn signup ON, sign yourself up, then turn it back OFF. Going forward, you'll invite users via the admin UI (Milestone 8) which uses the service-role key.

- [ ] **Step 3: Email template**

Authentication → Email Templates → Magic Link: customise the subject/body if desired (not required for this milestone).

- [ ] **Step 4: Commit a checklist file**

Create `docs/superpowers/operations/supabase-auth-setup.md`:

```markdown
# Supabase Auth Setup Checklist

Run through this in the Supabase dashboard whenever a new environment (dev / preview / prod) is created.

1. **URL Configuration**
   - Site URL set to the environment's base URL.
   - Add `<base>/auth/callback` to additional redirect URLs.
2. **Email provider**
   - Enabled, "Confirm email" ON, "Disable signup" ON.
   - To bootstrap the first admin: temporarily enable signup, sign up, then disable again.
3. **First admin promotion**
   - After first login, run in SQL editor:
     `update public.profiles set role = 'admin' where id = (select id from auth.users where email = '<you>');`
```

```bash
git add docs/superpowers/operations/
git commit -m "docs: supabase auth setup checklist"
```

---

## Task 9: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Import project on Vercel**

In the Vercel dashboard → Add New → Project → import `Th3Kasa/BigFatFamilyTree`. Framework auto-detects as Next.js.

- [ ] **Step 3: Set environment variables in Vercel**

In Project Settings → Environment Variables, add for **Production, Preview, and Development**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_APP_URL` (set to the Vercel production URL for Production, preview URL pattern for Preview)

- [ ] **Step 4: Deploy**

Vercel auto-deploys on push. Wait for build to complete.

- [ ] **Step 5: Add production redirect URL to Supabase**

In Supabase dashboard → Authentication → URL Configuration, add the production callback URL: `https://<your-vercel-project>.vercel.app/auth/callback`. Update Site URL to the production URL (or keep dev and add production as additional).

- [ ] **Step 6: Verify deployed app**

Visit the Vercel URL. Expected: redirect to `/login`. Sign in with magic link. Expected: redirected to `/` showing "Authenticated home".

- [ ] **Step 7: Verify security headers in production**

```bash
curl -I https://<your-vercel-project>.vercel.app/login
```

Expected response headers include `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`.

---

## Task 10: Dependabot + final commit

- [ ] **Step 1: Enable Dependabot**

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    labels: ["dependencies"]
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "monthly"
```

- [ ] **Step 2: Final smoke run**

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Expected: all four pass with no errors.

- [ ] **Step 3: Commit and push**

```bash
git add .github/
git commit -m "chore: enable Dependabot for npm and GitHub Actions"
git push origin main
```

---

## Acceptance criteria (Milestone 1 complete when all true)

- `npm run dev` starts the app; unauthenticated visit to `/` redirects to `/login`.
- Magic-link login round-trip works end-to-end against the real Supabase project.
- After first login, a `profiles` row exists; promoting the user to `admin` via SQL succeeds.
- `profiles`, `audit_log`, `settings` tables exist in Supabase with RLS enabled and policies attached.
- All security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) are present on every response.
- Auth endpoints rate-limited at 5 requests / min / IP (returns 429 on 6th rapid request).
- `.env.example` committed; `.env.local` gitignored; service-role key never imported into a client component (enforced by `server-only`).
- `npm run typecheck`, `lint`, `test`, `build` all pass.
- App deployed to Vercel and reachable; production login round-trip works.
- Dependabot config committed.
