# Milestone 7: Audio Transcripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let editors upload audio recordings, store them in Supabase Storage, manually enter Arabic transcripts, link recordings to people, and view them on a transcripts list page.

**Architecture:** Audio files upload directly to a Supabase Storage `audio` bucket (5 MB limit per file, audio MIME types). Transcript metadata is written via a Server Action to the existing `transcripts` table. A `/transcripts` page lists all transcripts. Transcript detail shows the raw text and links to the associated person. No AI extraction in this milestone — that is future work.

**Tech Stack:** Next.js 16 Server Actions, React 19 `useActionState`/`useFormStatus`, Zod v4, Supabase SSR + Storage, Tailwind CSS v4.

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260519000012_storage_audio.sql` | **Create** | `audio` storage bucket + RLS policies |
| `lib/validation/transcripts.ts` | **Create** | Zod schema for transcript create |
| `lib/actions/transcripts.ts` | **Create** | `createTranscript` server action |
| `components/forms/AudioUpload.tsx` | **Create** | Client component — uploads audio file, returns storage URL |
| `components/forms/TranscriptForm.tsx` | **Create** | Full create-transcript form (audio + metadata + text) |
| `app/transcripts/page.tsx` | **Create** | List all transcripts |
| `app/transcripts/new/page.tsx` | **Create** | Upload + create new transcript |
| `app/transcripts/[id]/page.tsx` | **Create** | View a single transcript |
| `tests/smoke/transcripts-validation.test.ts` | **Create** | Unit tests for transcript Zod schema |

---

### Task 1: Audio storage bucket migration

**Files:**
- Create: `supabase/migrations/20260519000012_storage_audio.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- audio bucket: authenticated read, editor/admin write
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio', 'audio', false,
  52428800,  -- 50 MB
  array['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm','audio/aac']
)
on conflict (id) do nothing;

-- Authenticated users can read audio
create policy "audio_authenticated_read" on storage.objects
  for select using (
    bucket_id = 'audio'
    and auth.uid() is not null
  );

-- Only editors/admins can upload
create policy "audio_editor_insert" on storage.objects
  for insert with check (
    bucket_id = 'audio'
    and auth.uid() is not null
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'editor')
    )
  );

-- Only editors/admins can delete
create policy "audio_editor_delete" on storage.objects
  for delete using (
    bucket_id = 'audio'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'editor')
    )
  );
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use the `mcp__1fc8b5d6-0512-462f-88a0-13c96b9a561b__apply_migration` tool:
- `project_id`: `srmmatuyiybtgowwvixd`
- `name`: `storage_audio`
- `query`: contents of the SQL above

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add supabase/migrations/20260519000012_storage_audio.sql
git commit -m "feat(storage): audio bucket with RLS for authenticated read, editor upload"
```

---

### Task 2: Transcript Zod schema + tests

**Files:**
- Create: `lib/validation/transcripts.ts`
- Test: `tests/smoke/transcripts-validation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/smoke/transcripts-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { transcriptSchema } from "@/lib/validation/transcripts";

describe("transcriptSchema", () => {
  const valid = {
    audio_url: "https://example.com/audio/test.mp3",
    raw_text_ar: "نص الصوت",
    recorded_at: "2024-03-15",
    recorded_with: null,
  };

  it("accepts a valid transcript", () => {
    expect(transcriptSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts null raw_text_ar", () => {
    expect(transcriptSchema.safeParse({ ...valid, raw_text_ar: null }).success).toBe(true);
  });

  it("accepts null recorded_at", () => {
    expect(transcriptSchema.safeParse({ ...valid, recorded_at: null }).success).toBe(true);
  });

  it("rejects invalid audio_url", () => {
    expect(transcriptSchema.safeParse({ ...valid, audio_url: "not-a-url" }).success).toBe(false);
  });

  it("accepts valid UUID for recorded_with", () => {
    expect(
      transcriptSchema.safeParse({ ...valid, recorded_with: "aaaaaaaa-0000-0000-0000-000000000001" }).success
    ).toBe(true);
  });

  it("rejects non-UUID recorded_with", () => {
    expect(transcriptSchema.safeParse({ ...valid, recorded_with: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects missing audio_url", () => {
    const { audio_url: _, ...rest } = valid;
    expect(transcriptSchema.safeParse(rest).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx vitest run tests/smoke/transcripts-validation.test.ts
```

Expected: FAIL — `transcriptSchema` not found.

- [ ] **Step 3: Create `lib/validation/transcripts.ts`**

```ts
import { z } from "zod";

export const transcriptSchema = z.object({
  audio_url: z.string().url(),
  raw_text_ar: z.string().max(50000).nullable(),
  recorded_at: z.string().date().nullable(),
  recorded_with: z.string().uuid().nullable(),
});

export type TranscriptInput = z.infer<typeof transcriptSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx vitest run tests/smoke/transcripts-validation.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add lib/validation/transcripts.ts tests/smoke/transcripts-validation.test.ts
git commit -m "feat(validation): transcript Zod schema with 7 unit tests"
```

---

### Task 3: Transcript server action

**Files:**
- Create: `lib/actions/transcripts.ts`

- [ ] **Step 1: Create `lib/actions/transcripts.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { transcriptSchema } from "@/lib/validation/transcripts";
import type { ActionState } from "@/lib/actions/people";

export async function createTranscript(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = {
    audio_url: formData.get("audio_url")?.toString() ?? null,
    raw_text_ar: formData.get("raw_text_ar")?.toString() || null,
    recorded_at: formData.get("recorded_at")?.toString() || null,
    recorded_with: formData.get("recorded_with")?.toString() || null,
  };

  const parsed = transcriptSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? "_";
      fieldErrors[key] = issue.message;
    }
    return { success: false, fieldErrors };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("transcripts")
    .insert({
      audio_url: parsed.data.audio_url,
      raw_text_ar: parsed.data.raw_text_ar,
      recorded_at: parsed.data.recorded_at,
      recorded_with: parsed.data.recorded_with || null,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/transcripts");
  redirect(`/transcripts/${data.id}`);
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
git add lib/actions/transcripts.ts
git commit -m "feat(actions): createTranscript server action"
```

---

### Task 4: AudioUpload component

**Files:**
- Create: `components/forms/AudioUpload.tsx`

- [ ] **Step 1: Create `components/forms/AudioUpload.tsx`**

```tsx
"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  onUpload: (url: string) => void;
};

const ACCEPTED = "audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,audio/aac";

export function AudioUpload({ onUpload }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);
    setFileName(file.name);

    const ext = file.name.split(".").pop() ?? "mp3";
    const path = `${crypto.randomUUID()}.${ext}`;

    const supabase = createClient();
    const { error: upErr } = await supabase.storage
      .from("audio")
      .upload(path, file, { upsert: false });

    if (upErr) {
      setError(upErr.message);
      setFileName(null);
      setUploading(false);
      return;
    }

    const { data: { signedUrl }, error: signErr } = await supabase.storage
      .from("audio")
      .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year

    if (signErr || !signedUrl) {
      setError(signErr?.message ?? "Could not get audio URL.");
      setUploading(false);
      return;
    }

    // Store the storage path (not signed URL) — we fetch signed URLs on demand
    // For simplicity here we store a path-based reference that the server can re-sign
    // Use the public path format: storage/v1/object/public/audio/<path>
    // Since bucket is private, store just the path key so server can sign it
    onUpload(path);
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-amber-400 transition-colors bg-gray-50 hover:bg-amber-50 text-sm text-gray-600"
      >
        <span className="text-2xl">🎙️</span>
        <span>
          {uploading
            ? "Uploading…"
            : fileName
              ? fileName
              : "Click to upload audio file"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
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
git add components/forms/AudioUpload.tsx
git commit -m "feat(forms): AudioUpload component for Supabase audio bucket"
```

---

### Task 5: TranscriptForm component

**Files:**
- Create: `components/forms/TranscriptForm.tsx`

- [ ] **Step 1: Create `components/forms/TranscriptForm.tsx`**

```tsx
"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions/people";
import type { Database } from "@/lib/db/types";
import { AudioUpload } from "./AudioUpload";

type PersonRow = Database["public"]["Tables"]["people"]["Row"];
type PeopleLookup = Pick<PersonRow, "id" | "given_en" | "given_ar">[];

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  people: PeopleLookup;
  lang: "ar" | "en";
};

function SubmitButton({ lang }: { lang: "ar" | "en" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold transition-colors"
    >
      {pending ? (lang === "ar" ? "جاري الحفظ…" : "Saving…") : (lang === "ar" ? "حفظ" : "Save transcript")}
    </button>
  );
}

export function TranscriptForm({ action, people, lang }: Props) {
  const [state, formAction] = useActionState(action, null);
  const [audioPath, setAudioPath] = useState<string | null>(null);

  const personLabel = (p: PeopleLookup[number]) =>
    (lang === "ar" ? p.given_ar ?? p.given_en : p.given_en ?? p.given_ar) ?? "?";

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Audio upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {lang === "ar" ? "ملف الصوت" : "Audio file"}
        </label>
        <AudioUpload onUpload={(path) => setAudioPath(path)} />
        <input type="hidden" name="audio_url" value={audioPath ?? ""} />
        {state?.fieldErrors?.["audio_url"] && (
          <p className="text-xs text-red-500 mt-1">{state.fieldErrors["audio_url"]}</p>
        )}
      </div>

      {/* Date recorded */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {lang === "ar" ? "تاريخ التسجيل" : "Date recorded"}
        </label>
        <input
          type="date"
          name="recorded_at"
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-full"
        />
      </div>

      {/* Recorded with */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {lang === "ar" ? "مسجَّل مع" : "Recorded with"}
        </label>
        <select
          name="recorded_with"
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white w-full"
        >
          <option value="">— {lang === "ar" ? "اختياري" : "optional"} —</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {personLabel(p)}
            </option>
          ))}
        </select>
      </div>

      {/* Transcript text */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {lang === "ar" ? "النص العربي" : "Arabic transcript"}
        </label>
        <textarea
          name="raw_text_ar"
          rows={8}
          dir="rtl"
          placeholder={lang === "ar" ? "اكتب أو الصق النص هنا…" : "Type or paste the Arabic text here…"}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y"
        />
      </div>

      <SubmitButton lang={lang} />
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
git add components/forms/TranscriptForm.tsx
git commit -m "feat(forms): TranscriptForm component"
```

---

### Task 6: Transcripts list page

**Files:**
- Create: `app/transcripts/page.tsx`

- [ ] **Step 1: Create `app/transcripts/page.tsx`**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";

export default async function TranscriptsPage() {
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const { data: transcripts } = await supabase
    .from("transcripts")
    .select("id, audio_url, recorded_at, recorded_with, created_at, raw_text_ar")
    .order("created_at", { ascending: false });

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 block mb-2">
            {lang === "ar" ? "→ العودة" : "← Back"}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === "ar" ? "التسجيلات الصوتية" : "Audio Transcripts"}
          </h1>
        </div>
        <a
          href="/transcripts/new"
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"
        >
          {lang === "ar" ? "＋ رفع تسجيل" : "＋ Upload"}
        </a>
      </div>

      {!transcripts || transcripts.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🎙️</div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            {lang === "ar" ? "لا توجد تسجيلات بعد" : "No recordings yet"}
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            {lang === "ar"
              ? "ارفع تسجيلاً صوتياً لحفظ قصص العائلة."
              : "Upload an audio recording to preserve family stories."}
          </p>
          <a
            href="/transcripts/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors"
          >
            {lang === "ar" ? "＋ رفع تسجيل" : "＋ Upload recording"}
          </a>
        </div>
      ) : (
        <ul className="space-y-3">
          {transcripts.map((t) => (
            <li key={t.id}>
              <a
                href={`/transcripts/${t.id}`}
                className="block p-4 rounded-xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎙️</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {t.recorded_at
                        ? new Date(t.recorded_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-AU")
                        : (lang === "ar" ? "تاريخ غير معروف" : "Unknown date")}
                    </p>
                    <p className="text-xs text-gray-400">
                      {lang === "ar" ? "أُضيف " : "Added "}
                      {new Date(t.created_at).toLocaleDateString()}
                    </p>
                    {t.raw_text_ar && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2 dir-rtl">
                        {t.raw_text_ar.slice(0, 120)}…
                      </p>
                    )}
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
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
git add app/transcripts/page.tsx
git commit -m "feat: /transcripts list page"
```

---

### Task 7: New transcript page

**Files:**
- Create: `app/transcripts/new/page.tsx`

- [ ] **Step 1: Create `app/transcripts/new/page.tsx`**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { createTranscript } from "@/lib/actions/transcripts";
import { TranscriptForm } from "@/components/forms/TranscriptForm";

export default async function NewTranscriptPage() {
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const { data: people } = await supabase
    .from("people")
    .select("id, given_en, given_ar")
    .is("deleted_at", null)
    .order("given_en");

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/transcripts" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        {lang === "ar" ? "→ العودة" : "← Back"}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">
        {lang === "ar" ? "رفع تسجيل صوتي" : "Upload recording"}
      </h1>
      <TranscriptForm action={createTranscript} people={people ?? []} lang={lang} />
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
git add app/transcripts/new/page.tsx
git commit -m "feat: /transcripts/new upload page"
```

---

### Task 8: Transcript detail page

**Files:**
- Create: `app/transcripts/[id]/page.tsx`

- [ ] **Step 1: Create `app/transcripts/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";

type Props = { params: Promise<{ id: string }> };

export default async function TranscriptDetailPage({ params }: Props) {
  const { id } = await params;
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const { data: transcript } = await supabase
    .from("transcripts")
    .select("*")
    .eq("id", id)
    .single();

  if (!transcript) notFound();

  // Get a signed URL for the audio (bucket is private)
  const { data: signedData } = await supabase.storage
    .from("audio")
    .createSignedUrl(transcript.audio_url, 3600); // 1 hour

  // Fetch linked person name if any
  let personName: string | null = null;
  if (transcript.recorded_with) {
    const { data: person } = await supabase
      .from("people")
      .select("given_en, given_ar")
      .eq("id", transcript.recorded_with)
      .single();
    if (person) {
      personName = lang === "ar" ? (person.given_ar ?? person.given_en) : (person.given_en ?? person.given_ar);
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/transcripts" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        {lang === "ar" ? "→ العودة" : "← Back"}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {lang === "ar" ? "تسجيل صوتي" : "Recording"}
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        {transcript.recorded_at
          ? new Date(transcript.recorded_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-AU")
          : (lang === "ar" ? "تاريخ غير معروف" : "Unknown date")}
        {personName && (
          <>
            {" · "}
            <a href={`/person/${transcript.recorded_with}`} className="text-amber-600 hover:underline">
              {personName}
            </a>
          </>
        )}
      </p>

      {/* Audio player */}
      {signedData?.signedUrl && (
        <div className="mb-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <audio controls className="w-full" src={signedData.signedUrl}>
            {lang === "ar" ? "متصفحك لا يدعم مشغّل الصوت." : "Your browser does not support audio."}
          </audio>
        </div>
      )}

      {/* Transcript text */}
      {transcript.raw_text_ar ? (
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">
            {lang === "ar" ? "النص" : "Transcript"}
          </h2>
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
            <p
              className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap"
              dir="rtl"
            >
              {transcript.raw_text_ar}
            </p>
          </div>
        </section>
      ) : (
        <p className="text-sm text-gray-400">
          {lang === "ar" ? "لا يوجد نص بعد." : "No transcript text yet."}
        </p>
      )}
    </main>
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
git add app/transcripts/
git commit -m "feat: /transcripts/[id] detail page with audio player"
git push
```
