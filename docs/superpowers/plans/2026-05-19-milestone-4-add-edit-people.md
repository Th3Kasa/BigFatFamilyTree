# Milestone 4: Add/Edit People Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated editors add, edit, soft-delete, and link family members — including bilingual name fields, parent assignment, spouse relationship creation, and optional photo upload.

**Architecture:** All mutations use Next.js 16 Server Actions with Zod validation. The regular Supabase server client (cookie session) is used so RLS handles role enforcement naturally — non-editors get a Supabase error which surfaces in the form. Photos upload directly to a Supabase Storage `photos` bucket. Forms use React 19 `useActionState` + `useFormStatus` for pending/error states.

**Tech Stack:** Next.js 16 Server Actions, React 19 `useActionState`/`useFormStatus`, Zod v4, Supabase SSR client, Supabase Storage, Tailwind CSS v4.

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260519000011_storage_photos.sql` | **Create** | `photos` storage bucket + RLS policies |
| `lib/validation/people.ts` | **Create** | Zod schema for person create/update |
| `lib/actions/people.ts` | **Create** | `createPerson`, `updatePerson`, `deletePerson` server actions |
| `lib/actions/relationships.ts` | **Create** | `createRelationship`, `deleteRelationship` server actions |
| `components/forms/PhotoUpload.tsx` | **Create** | File input that uploads to Supabase Storage, returns URL |
| `components/forms/PersonForm.tsx` | **Create** | Reusable bilingual add/edit form (client component) |
| `components/forms/RelationshipForm.tsx` | **Create** | Add spouse/relationship to a person |
| `app/person/new/page.tsx` | **Create** | Add person page |
| `app/person/[id]/edit/page.tsx` | **Create** | Edit person page |
| `app/person/[id]/page.tsx` | **Modify** | Add Edit button, Delete button, RelationshipForm section |
| `app/page.tsx` | **Modify** | Add "＋ Add person" FAB overlay |
| `tests/smoke/people-validation.test.ts` | **Create** | Zod schema unit tests |

---

### Task 1: Storage bucket migration

**Files:**
- Create: `supabase/migrations/20260519000011_storage_photos.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- photos bucket: public read, editor/admin write
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos', 'photos', true,
  5242880,  -- 5 MB
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do nothing;

-- Anyone can read photos (bucket is public but policy is also needed)
create policy "photos_public_read" on storage.objects
  for select using (bucket_id = 'photos');

-- Only editors/admins can upload
create policy "photos_editor_insert" on storage.objects
  for insert with check (
    bucket_id = 'photos'
    and auth.uid() is not null
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'editor')
    )
  );

-- Only editors/admins can delete (for re-upload / cleanup)
create policy "photos_editor_delete" on storage.objects
  for delete using (
    bucket_id = 'photos'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'editor')
    )
  );
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use the `mcp__1fc8b5d6-0512-462f-88a0-13c96b9a561b__apply_migration` tool:
- `project_id`: `srmmatuyiybtgowwvixd`
- `name`: `storage_photos`
- `query`: contents of the file above

- [ ] **Step 3: Commit the migration file**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add supabase/migrations/20260519000011_storage_photos.sql
git commit -m "feat(storage): photos bucket with RLS for editor upload"
```

---

### Task 2: Zod validation schema for people

**Files:**
- Create: `lib/validation/people.ts`
- Test: `tests/smoke/people-validation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/smoke/people-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { personSchema, type PersonInput } from "@/lib/validation/people";

describe("personSchema", () => {
  const valid: PersonInput = {
    given_en: "Alice",
    given_ar: null,
    father_name_en: null,
    father_name_ar: null,
    grandfather_name_en: null,
    grandfather_name_ar: null,
    great_grandfather_name_en: null,
    great_grandfather_name_ar: null,
    family_name_en: "Smith",
    family_name_ar: null,
    gender: "f",
    father_id: null,
    mother_id: null,
    is_placeholder: false,
    photo_url: null,
    notes_en: null,
    notes_ar: null,
  };

  it("accepts a valid person with only given_en", () => {
    expect(personSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects when both given_en and given_ar are null", () => {
    const result = personSchema.safeParse({ ...valid, given_en: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/name/i);
    }
  });

  it("rejects invalid gender", () => {
    const result = personSchema.safeParse({ ...valid, gender: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects photo_url that is not a URL", () => {
    const result = personSchema.safeParse({ ...valid, photo_url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("accepts null photo_url", () => {
    expect(personSchema.safeParse({ ...valid, photo_url: null }).success).toBe(true);
  });

  it("accepts a valid UUID for father_id", () => {
    const result = personSchema.safeParse({
      ...valid,
      father_id: "aaaaaaaa-0000-0000-0000-000000000002",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID father_id", () => {
    const result = personSchema.safeParse({ ...valid, father_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx vitest run tests/smoke/people-validation.test.ts
```

Expected: FAIL — `personSchema` not found.

- [ ] **Step 3: Create `lib/validation/people.ts`**

```ts
import { z } from "zod";

const nullableText = z.string().max(200).nullable();
const nullableUuid = z.string().uuid().nullable();

export const personSchema = z
  .object({
    given_en:                   nullableText,
    given_ar:                   nullableText,
    father_name_en:             nullableText,
    father_name_ar:             nullableText,
    grandfather_name_en:        nullableText,
    grandfather_name_ar:        nullableText,
    great_grandfather_name_en:  nullableText,
    great_grandfather_name_ar:  nullableText,
    family_name_en:             nullableText,
    family_name_ar:             nullableText,
    gender:                     z.enum(["m", "f", "unknown"]),
    father_id:                  nullableUuid,
    mother_id:                  nullableUuid,
    is_placeholder:             z.boolean(),
    photo_url:                  z.string().url().nullable(),
    notes_en:                   z.string().max(2000).nullable(),
    notes_ar:                   z.string().max(2000).nullable(),
  })
  .refine(
    (d) => d.given_en != null || d.given_ar != null || d.is_placeholder,
    { message: "At least one name (English or Arabic) is required", path: ["given_en"] },
  );

export type PersonInput = z.infer<typeof personSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx vitest run tests/smoke/people-validation.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add lib/validation/people.ts tests/smoke/people-validation.test.ts
git commit -m "feat(validation): person Zod schema with 7 unit tests"
```

---

### Task 3: Server actions for people

**Files:**
- Create: `lib/actions/people.ts`

- [ ] **Step 1: Create `lib/actions/people.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { personSchema } from "@/lib/validation/people";

export type ActionState = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  personId?: string;
} | null;

// ── createPerson ──────────────────────────────────────────────────────────────
export async function createPerson(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = Object.fromEntries(
    [...formData.entries()].map(([k, v]) => [k, v === "" ? null : v]),
  );
  // coerce boolean and nulls
  const parsed = personSchema.safeParse({
    ...raw,
    is_placeholder: raw.is_placeholder === "true",
    gender: raw.gender ?? "unknown",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? "_";
      fieldErrors[key] = issue.message;
    }
    return { success: false, fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  revalidatePath(`/person/${data.id}`);
  redirect(`/person/${data.id}`);
}

// ── updatePerson ──────────────────────────────────────────────────────────────
export async function updatePerson(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = Object.fromEntries(
    [...formData.entries()].map(([k, v]) => [k, v === "" ? null : v]),
  );
  const parsed = personSchema.safeParse({
    ...raw,
    is_placeholder: raw.is_placeholder === "true",
    gender: raw.gender ?? "unknown",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? "_";
      fieldErrors[key] = issue.message;
    }
    return { success: false, fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  revalidatePath(`/person/${id}`);
  redirect(`/person/${id}`);
}

// ── deletePerson (soft delete) ────────────────────────────────────────────────
export async function deletePerson(id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  redirect("/");
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
git add lib/actions/people.ts
git commit -m "feat(actions): createPerson, updatePerson, deletePerson server actions"
```

---

### Task 4: Server actions for relationships

**Files:**
- Create: `lib/actions/relationships.ts`

- [ ] **Step 1: Create `lib/actions/relationships.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/actions/people";

export async function createRelationship(
  personId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const otherPersonId = formData.get("other_person_id")?.toString()?.trim();
  const type = formData.get("type")?.toString();
  const status = formData.get("status")?.toString();

  if (!otherPersonId || !type || !status) {
    return { success: false, error: "All fields are required." };
  }

  const validTypes = ["spouse", "adopted_by", "raised_by", "godparent"] as const;
  const validStatuses = ["current", "divorced", "widowed"] as const;

  if (!validTypes.includes(type as (typeof validTypes)[number])) {
    return { success: false, error: "Invalid relationship type." };
  }
  if (!validStatuses.includes(status as (typeof validStatuses)[number])) {
    return { success: false, error: "Invalid relationship status." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("relationships").insert({
    person_a_id: personId,
    person_b_id: otherPersonId,
    type: type as (typeof validTypes)[number],
    status: status as (typeof validStatuses)[number],
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  revalidatePath(`/person/${personId}`);
  return { success: true };
}

export async function deleteRelationship(
  relationshipId: string,
  personId: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("relationships")
    .delete()
    .eq("id", relationshipId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  revalidatePath(`/person/${personId}`);
  return { success: true };
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
git add lib/actions/relationships.ts
git commit -m "feat(actions): createRelationship, deleteRelationship server actions"
```

---

### Task 5: PhotoUpload component

**Files:**
- Create: `components/forms/PhotoUpload.tsx`

- [ ] **Step 1: Create `components/forms/PhotoUpload.tsx`**

```tsx
"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  currentUrl: string | null;
  onUpload: (url: string) => void;
};

export function PhotoUpload({ currentUrl, onUpload }: Props) {
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);

    // Show local preview immediately
    setPreview(URL.createObjectURL(file));

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;

    const supabase = createClient();
    const { error: upErr } = await supabase.storage
      .from("photos")
      .upload(path, file, { upsert: false });

    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("photos").getPublicUrl(path);
    onUpload(data.publicUrl);
    setUploading(false);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-dashed border-gray-300 hover:border-amber-400 transition-colors flex items-center justify-center bg-gray-50"
      >
        {preview ? (
          <img src={preview} alt="Photo" className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl">📷</span>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-xs">Uploading…</span>
          </div>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={handleChange}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
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
git add components/forms/PhotoUpload.tsx
git commit -m "feat(forms): PhotoUpload component with Supabase Storage"
```

---

### Task 6: PersonForm component

**Files:**
- Create: `components/forms/PersonForm.tsx`

This is the main form used by both the Add and Edit pages.

- [ ] **Step 1: Create `components/forms/PersonForm.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions/people";
import type { Database } from "@/lib/db/types";
import { PhotoUpload } from "./PhotoUpload";

type PersonRow = Database["public"]["Tables"]["people"]["Row"];
type PeopleLookup = Pick<PersonRow, "id" | "given_en" | "given_ar" | "family_name_en" | "family_name_ar">[];

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initialData?: Partial<PersonRow>;
  people: PeopleLookup;
  lang: "ar" | "en";
  submitLabel: string;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold transition-colors"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function PersonForm({ action, initialData, people, lang, submitLabel }: Props) {
  const [state, formAction] = useActionState(action, null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialData?.photo_url ?? null);

  function field(name: string): string | undefined {
    return state?.fieldErrors?.[name];
  }

  const personLabel = (p: PeopleLookup[number]) =>
    (lang === "ar" ? p.given_ar ?? p.given_en : p.given_en ?? p.given_ar) ?? "?";

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Photo */}
      <div className="flex justify-center">
        <PhotoUpload currentUrl={photoUrl} onUpload={setPhotoUrl} />
        <input type="hidden" name="photo_url" value={photoUrl ?? ""} />
      </div>

      {/* Name fields — bilingual grid */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-700 mb-2">
          {lang === "ar" ? "الاسم الأول" : "Given name"}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">English</label>
            <input
              name="given_en"
              defaultValue={initialData?.given_en ?? ""}
              placeholder="e.g. Marcelle"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {field("given_en") && <p className="text-xs text-red-500 mt-1">{field("given_en")}</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">عربي</label>
            <input
              name="given_ar"
              defaultValue={initialData?.given_ar ?? ""}
              placeholder="مثال: مارسيل"
              dir="rtl"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>
      </fieldset>

      {/* Father name */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Father name (EN)</label>
          <input name="father_name_en" defaultValue={initialData?.father_name_en ?? ""} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">اسم الأب</label>
          <input name="father_name_ar" defaultValue={initialData?.father_name_ar ?? ""} dir="rtl" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
      </div>

      {/* Grandfather name */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Grandfather name (EN)</label>
          <input name="grandfather_name_en" defaultValue={initialData?.grandfather_name_en ?? ""} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">اسم الجد</label>
          <input name="grandfather_name_ar" defaultValue={initialData?.grandfather_name_ar ?? ""} dir="rtl" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
      </div>

      {/* Family name */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Family name (EN)</label>
          <input name="family_name_en" defaultValue={initialData?.family_name_en ?? ""} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">اسم العائلة</label>
          <input name="family_name_ar" defaultValue={initialData?.family_name_ar ?? ""} dir="rtl" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
      </div>

      {/* Gender */}
      <div>
        <label className="block text-xs text-gray-500 mb-2">
          {lang === "ar" ? "الجنس" : "Gender"}
        </label>
        <div className="flex gap-4">
          {(["f", "m", "unknown"] as const).map((g) => (
            <label key={g} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="gender"
                value={g}
                defaultChecked={(initialData?.gender ?? "unknown") === g}
                className="accent-amber-500"
              />
              {g === "f" ? "👩 Female" : g === "m" ? "👨 Male" : "Unknown"}
            </label>
          ))}
        </div>
      </div>

      {/* Parent linking */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            {lang === "ar" ? "الأب" : "Father"}
          </label>
          <select
            name="father_id"
            defaultValue={initialData?.father_id ?? ""}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          >
            <option value="">— none —</option>
            {people
              .filter((p) => p.id !== initialData?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>{personLabel(p)}</option>
              ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            {lang === "ar" ? "الأم" : "Mother"}
          </label>
          <select
            name="mother_id"
            defaultValue={initialData?.mother_id ?? ""}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          >
            <option value="">— none —</option>
            {people
              .filter((p) => p.id !== initialData?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>{personLabel(p)}</option>
              ))}
          </select>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">
          {lang === "ar" ? "ملاحظات (إنجليزي)" : "Notes (English)"}
        </label>
        <textarea
          name="notes_en"
          defaultValue={initialData?.notes_en ?? ""}
          rows={3}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">ملاحظات (عربي)</label>
        <textarea
          name="notes_ar"
          defaultValue={initialData?.notes_ar ?? ""}
          rows={3}
          dir="rtl"
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
        />
      </div>

      {/* Hidden fields */}
      <input type="hidden" name="is_placeholder" value="false" />
      <input type="hidden" name="great_grandfather_name_en" value={initialData?.great_grandfather_name_en ?? ""} />
      <input type="hidden" name="great_grandfather_name_ar" value={initialData?.great_grandfather_name_ar ?? ""} />

      <SubmitButton label={submitLabel} />
    </form>
  );
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
git add components/forms/PersonForm.tsx
git commit -m "feat(forms): PersonForm bilingual add/edit component"
```

---

### Task 7: RelationshipForm component

**Files:**
- Create: `components/forms/RelationshipForm.tsx`

- [ ] **Step 1: Create `components/forms/RelationshipForm.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions/people";
import type { Database } from "@/lib/db/types";

type PersonRow = Database["public"]["Tables"]["people"]["Row"];
type PeopleLookup = Pick<PersonRow, "id" | "given_en" | "given_ar" | "family_name_en">[];

type Props = {
  personId: string;
  people: PeopleLookup;
  lang: "ar" | "en";
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
    >
      {pending ? "Adding…" : (true ? "Add" : "إضافة")}
    </button>
  );
}

export function RelationshipForm({ people, lang, action }: Props) {
  const [state, formAction] = useActionState(action, null);

  const personLabel = (p: PeopleLookup[number]) =>
    (lang === "ar" ? p.given_ar ?? p.given_en : p.given_en ?? p.given_ar) ?? "?";

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && (
        <p className="text-xs text-red-500">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-xs text-green-600">
          {lang === "ar" ? "تمت الإضافة" : "Added successfully"}
        </p>
      )}
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            {lang === "ar" ? "الشخص" : "Person"}
          </label>
          <select
            name="other_person_id"
            required
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          >
            <option value="">— select —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{personLabel(p)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            {lang === "ar" ? "النوع" : "Type"}
          </label>
          <select
            name="type"
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          >
            <option value="spouse">{lang === "ar" ? "زوج/زوجة" : "Spouse"}</option>
            <option value="adopted_by">{lang === "ar" ? "متبنَّى بواسطة" : "Adopted by"}</option>
            <option value="raised_by">{lang === "ar" ? "تربى بواسطة" : "Raised by"}</option>
            <option value="godparent">{lang === "ar" ? "عرّاب" : "Godparent"}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            {lang === "ar" ? "الحالة" : "Status"}
          </label>
          <select
            name="status"
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          >
            <option value="current">{lang === "ar" ? "حالي" : "Current"}</option>
            <option value="divorced">{lang === "ar" ? "مطلق" : "Divorced"}</option>
            <option value="widowed">{lang === "ar" ? "أرمل" : "Widowed"}</option>
          </select>
        </div>
        <SubmitButton />
      </div>
    </form>
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
git add components/forms/RelationshipForm.tsx
git commit -m "feat(forms): RelationshipForm component"
```

---

### Task 8: Add person page

**Files:**
- Create: `app/person/new/page.tsx`

- [ ] **Step 1: Create `app/person/new/page.tsx`**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { createPerson } from "@/lib/actions/people";
import { PersonForm } from "@/components/forms/PersonForm";

export default async function NewPersonPage() {
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const { data: people } = await supabase
    .from("people")
    .select("id, given_en, given_ar, family_name_en, family_name_ar")
    .is("deleted_at", null)
    .order("given_en");

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        {lang === "ar" ? "→ العودة" : "← Back"}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">
        {lang === "ar" ? "إضافة شخص" : "Add person"}
      </h1>
      <PersonForm
        action={createPerson}
        people={people ?? []}
        lang={lang}
        submitLabel={lang === "ar" ? "حفظ" : "Save"}
      />
    </main>
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
git add app/person/new/
git commit -m "feat: /person/new add person page"
```

---

### Task 9: Edit person page

**Files:**
- Create: `app/person/[id]/edit/page.tsx`

- [ ] **Step 1: Create `app/person/[id]/edit/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { updatePerson } from "@/lib/actions/people";
import { PersonForm } from "@/components/forms/PersonForm";

type Props = { params: Promise<{ id: string }> };

export default async function EditPersonPage({ params }: Props) {
  const { id } = await params;
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const [{ data: person }, { data: people }] = await Promise.all([
    supabase.from("people").select("*").eq("id", id).is("deleted_at", null).single(),
    supabase
      .from("people")
      .select("id, given_en, given_ar, family_name_en, family_name_ar")
      .is("deleted_at", null)
      .order("given_en"),
  ]);

  if (!person) notFound();

  // Bind the person id into the action
  const updateThisPerson = updatePerson.bind(null, id);

  const given = lang === "ar" ? (person.given_ar ?? person.given_en) : (person.given_en ?? person.given_ar);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Link
        href={`/person/${id}`}
        className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block"
      >
        {lang === "ar" ? "→ العودة" : "← Back"}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">
        {lang === "ar" ? `تعديل: ${given ?? ""}` : `Edit: ${given ?? ""}`}
      </h1>
      <PersonForm
        action={updateThisPerson}
        initialData={person}
        people={people ?? []}
        lang={lang}
        submitLabel={lang === "ar" ? "حفظ التغييرات" : "Save changes"}
      />
    </main>
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
git add app/person/
git commit -m "feat: /person/[id]/edit page"
```

---

### Task 10: Update profile page + home FAB

**Files:**
- Modify: `app/person/[id]/page.tsx` — add Edit/Delete buttons + RelationshipForm
- Modify: `app/page.tsx` — add "＋ Add" FAB

- [ ] **Step 1: Read both files**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
cat app/person/[id]/page.tsx
cat app/page.tsx
```

- [ ] **Step 2: Update `app/person/[id]/page.tsx`**

Add these imports at the top (after existing imports):
```tsx
import { deletePerson } from "@/lib/actions/people";
import { createRelationship } from "@/lib/actions/relationships";
import { RelationshipForm } from "@/components/forms/RelationshipForm";
```

Add a `people` fetch to the existing `Promise.all` (alongside person + events):
```ts
supabase
  .from("people")
  .select("id, given_en, given_ar, family_name_en, family_name_ar")
  .is("deleted_at", null)
  .neq("id", id),
```

So the Promise.all becomes:
```ts
const [{ data: person }, { data: events }, { data: people }] = await Promise.all([
  supabase.from("people").select("*").eq("id", id).is("deleted_at", null).single(),
  supabase.from("events").select("*").eq("person_id", id).order("date_value", { ascending: true }),
  supabase.from("people").select("id, given_en, given_ar, family_name_en, family_name_ar").is("deleted_at", null).neq("id", id),
]);
```

After the Back link, add Edit + Delete buttons:
```tsx
{/* Action buttons */}
<div className="flex gap-2 mb-8">
  <a
    href={`/person/${person.id}/edit`}
    className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
  >
    {lang === "ar" ? "✏️ تعديل" : "✏️ Edit"}
  </a>
  <form action={deletePerson.bind(null, person.id)}>
    <button
      type="submit"
      className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
      onClick={(e) => {
        if (!confirm(lang === "ar" ? "حذف هذا الشخص؟" : "Delete this person?")) e.preventDefault();
      }}
    >
      {lang === "ar" ? "🗑 حذف" : "🗑 Delete"}
    </button>
  </form>
</div>
```

After the Timeline section, add Relationships section:
```tsx
{/* Relationships */}
<section className="mt-8">
  <h2 className="text-base font-semibold text-gray-700 mb-4">
    {lang === "ar" ? "العلاقات" : "Relationships"}
  </h2>
  <RelationshipForm
    personId={person.id}
    people={people ?? []}
    lang={lang}
    action={createRelationship.bind(null, person.id)}
  />
</section>
```

- [ ] **Step 3: Update `app/page.tsx`** — add FAB after the existing JSX

Add a floating "＋" button that links to `/person/new`. Inside the return statement, after the existing `<>` wrapper, add:

```tsx
{/* FAB — visible on both desktop and mobile */}
<a
  href="/person/new"
  className="fixed bottom-6 end-6 z-50 w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-600 shadow-lg flex items-center justify-center text-white text-2xl transition-colors"
  aria-label="Add person"
>
  ＋
</a>
```

- [ ] **Step 4: Run typecheck**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx tsc --noEmit
```

- [ ] **Step 5: Run full test suite**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit and push**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add app/person/ app/page.tsx
git commit -m "feat: edit/delete buttons on profile, relationship form, add-person FAB"
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ Add new person — Tasks 8, 10
- ✅ Edit existing person — Task 9
- ✅ Soft-delete — Task 3 (`deletePerson`), Task 10 (button on profile)
- ✅ Link parents (father_id/mother_id) — Task 6 (PersonForm selects)
- ✅ Add spouse/relationship — Tasks 4, 7, 10
- ✅ Photo upload — Tasks 1, 5 (storage bucket + PhotoUpload)
- ✅ Role gate — server client uses RLS from session (admin/editor only can write)
- ✅ Bilingual form fields — Task 6 (PersonForm grid layout)
- ✅ FAB from home page — Task 10
- ✅ Zod validation — Tasks 2, 3 (schema + action)
- ✅ 7 unit tests for validation schema — Task 2

**No placeholders:** All steps contain complete code.

**Type consistency:** `ActionState` defined once in `lib/actions/people.ts`, imported by `relationships.ts`, `PersonForm`, `RelationshipForm`. `PersonInput` from `lib/validation/people.ts` matches `people` table Insert type.
