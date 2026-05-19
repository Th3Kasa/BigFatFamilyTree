# Milestone 5: Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a `/admin` section to view all users, change their roles, and browse the audit log.

**Architecture:** A server-rendered `/admin` route group guarded by a server-side role check (redirect non-admins). All mutations are Server Actions. The Supabase server client uses the session cookie, so RLS enforces admin-only writes. Audit log is read-only display.

**Tech Stack:** Next.js 16 App Router, Server Actions, Supabase SSR, Tailwind CSS v4, Zod v4.

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `app/admin/layout.tsx` | **Create** | Admin section layout — server-side admin guard, redirects non-admins |
| `app/admin/page.tsx` | **Create** | User list: show all profiles, role badges, change-role form per row |
| `app/admin/audit/page.tsx` | **Create** | Audit log: paginated table of audit_log rows |
| `lib/actions/admin.ts` | **Create** | `updateUserRole` server action |
| `lib/validation/admin.ts` | **Create** | Zod schema for role update |
| `tests/smoke/admin-validation.test.ts` | **Create** | Unit tests for admin Zod schema |

---

### Task 1: Admin validation schema + tests

**Files:**
- Create: `lib/validation/admin.ts`
- Test: `tests/smoke/admin-validation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/smoke/admin-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { roleUpdateSchema } from "@/lib/validation/admin";

describe("roleUpdateSchema", () => {
  it("accepts valid roles", () => {
    expect(roleUpdateSchema.safeParse({ userId: "aaaaaaaa-0000-0000-0000-000000000001", role: "editor" }).success).toBe(true);
    expect(roleUpdateSchema.safeParse({ userId: "aaaaaaaa-0000-0000-0000-000000000001", role: "admin" }).success).toBe(true);
    expect(roleUpdateSchema.safeParse({ userId: "aaaaaaaa-0000-0000-0000-000000000001", role: "viewer" }).success).toBe(true);
  });

  it("rejects invalid role", () => {
    const result = roleUpdateSchema.safeParse({ userId: "aaaaaaaa-0000-0000-0000-000000000001", role: "superuser" });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID userId", () => {
    const result = roleUpdateSchema.safeParse({ userId: "not-a-uuid", role: "editor" });
    expect(result.success).toBe(false);
  });

  it("rejects missing userId", () => {
    const result = roleUpdateSchema.safeParse({ role: "editor" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx vitest run tests/smoke/admin-validation.test.ts
```

Expected: FAIL — `roleUpdateSchema` not found.

- [ ] **Step 3: Create `lib/validation/admin.ts`**

```ts
import { z } from "zod";

export const roleUpdateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "editor", "viewer"]),
});

export type RoleUpdate = z.infer<typeof roleUpdateSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx vitest run tests/smoke/admin-validation.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add lib/validation/admin.ts tests/smoke/admin-validation.test.ts
git commit -m "feat(validation): admin role-update Zod schema with tests"
```

---

### Task 2: Admin server action

**Files:**
- Create: `lib/actions/admin.ts`

- [ ] **Step 1: Create `lib/actions/admin.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { roleUpdateSchema } from "@/lib/validation/admin";

export type AdminActionState = {
  success: boolean;
  error?: string;
} | null;

export async function updateUserRole(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = roleUpdateSchema.safeParse({
    userId: formData.get("userId")?.toString(),
    role: formData.get("role")?.toString(),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();

  // Verify caller is admin (belt-and-suspenders on top of RLS)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "admin") {
    return { success: false, error: "Forbidden." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.userId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin");
  return { success: true };
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add lib/actions/admin.ts
git commit -m "feat(actions): updateUserRole admin server action"
```

---

### Task 3: Admin layout (route guard)

**Files:**
- Create: `app/admin/layout.tsx`

- [ ] **Step 1: Create `app/admin/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <a href="/" className="text-sm text-gray-400 hover:text-gray-600">← Home</a>
        <h1 className="text-lg font-semibold text-gray-900">Admin</h1>
        <nav className="flex gap-4 ms-4">
          <a href="/admin" className="text-sm text-gray-600 hover:text-gray-900">Users</a>
          <a href="/admin/audit" className="text-sm text-gray-600 hover:text-gray-900">Audit Log</a>
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add app/admin/layout.tsx
git commit -m "feat(admin): admin layout with server-side role guard"
```

---

### Task 4: Admin users page

**Files:**
- Create: `app/admin/page.tsx`

- [ ] **Step 1: Create `app/admin/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { updateUserRole } from "@/lib/actions/admin";
import type { Database } from "@/lib/db/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700 border-purple-200",
  editor: "bg-amber-100 text-amber-700 border-amber-200",
  viewer: "bg-gray-100 text-gray-600 border-gray-200",
};

function RoleSelect({ profile }: { profile: Profile }) {
  return (
    <form action={updateUserRole}>
      <input type="hidden" name="userId" value={profile.id} />
      <div className="flex items-center gap-2">
        <select
          name="role"
          defaultValue={profile.role}
          className="border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
        >
          <option value="viewer">viewer</option>
          <option value="editor">editor</option>
          <option value="admin">admin</option>
        </select>
        <button
          type="submit"
          className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-colors"
        >
          Save
        </button>
      </div>
    </form>
  );
}

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Users</h2>
        <span className="text-sm text-gray-400">{profiles?.length ?? 0} total</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Change role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(profiles ?? []).map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{p.display_name ?? "—"}</div>
                  <div className="text-xs text-gray-400 font-mono">{p.id.slice(0, 8)}…</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[p.role] ?? ROLE_COLORS.viewer}`}>
                    {p.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(p.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <RoleSelect profile={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add app/admin/page.tsx
git commit -m "feat(admin): users page with role change"
```

---

### Task 5: Audit log page

**Files:**
- Create: `app/admin/audit/page.tsx`

- [ ] **Step 1: Create `app/admin/audit/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

type Props = { searchParams: Promise<{ page?: string }> };

export default async function AuditLogPage({ searchParams }: Props) {
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const { data: rows, count } = await supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Audit Log</h2>
        <span className="text-sm text-gray-400">{count ?? 0} total entries</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Operation</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Table</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Row ID</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                    r.operation === "insert" ? "bg-green-50 text-green-700 border-green-200" :
                    r.operation === "delete" ? "bg-red-50 text-red-700 border-red-200" :
                    "bg-blue-50 text-blue-700 border-blue-200"
                  }`}>
                    {r.operation}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-gray-700">{r.table_name}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-400">{r.row_id?.slice(0, 8) ?? "—"}…</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-400">{r.actor_id?.slice(0, 8) ?? "—"}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex gap-2">
          {page > 1 && (
            <a
              href={`/admin/audit?page=${page - 1}`}
              className="px-3 py-1 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
            >
              ← Prev
            </a>
          )}
          <span className="px-3 py-1 text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <a
              href={`/admin/audit?page=${page + 1}`}
              className="px-3 py-1 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
            >
              Next →
            </a>
          )}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Run typecheck + full test suite**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx tsc --noEmit && npx vitest run
```

Expected: no type errors, all tests pass.

- [ ] **Step 3: Commit and push**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add app/admin/audit/page.tsx
git commit -m "feat(admin): audit log page with pagination"
git push
```
