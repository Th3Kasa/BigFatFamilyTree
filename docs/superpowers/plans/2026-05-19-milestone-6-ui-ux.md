# Milestone 6: UI/UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the app from functional to delightful — improve the home page, person profile, nav, empty states, and loading UX without changing any data model or business logic.

**Architecture:** Pure presentational improvements in existing files. No new routes, no new DB queries, no new server actions. All changes are in `.tsx` layout/page/component files. Use Tailwind CSS v4 logical properties throughout (no hardcoded `left`/`right`).

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4.

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `app/layout.tsx` | **Modify** | Richer header bar with nav links, sign-out button |
| `app/page.tsx` | **Modify** | Better home: empty state when no people, graph/list switcher label |
| `app/person/[id]/page.tsx` | **Modify** | Notes section, photo fallback initials, relationships display list |
| `components/ui/EmptyState.tsx` | **Create** | Reusable empty state component |
| `components/ui/SignOutButton.tsx` | **Create** | Client component for sign-out |

---

### Task 1: SignOutButton + EmptyState components

**Files:**
- Create: `components/ui/SignOutButton.tsx`
- Create: `components/ui/EmptyState.tsx`

- [ ] **Step 1: Create `components/ui/SignOutButton.tsx`**

```tsx
"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function SignOutButton({ lang }: { lang: "ar" | "en" }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-sm text-gray-400 hover:text-gray-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100"
    >
      {lang === "ar" ? "تسجيل الخروج" : "Sign out"}
    </button>
  );
}
```

- [ ] **Step 2: Create `components/ui/EmptyState.tsx`**

```tsx
type Props = {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
};

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 max-w-xs mb-6">{description}</p>
      {action}
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add components/ui/SignOutButton.tsx components/ui/EmptyState.tsx
git commit -m "feat(ui): SignOutButton and EmptyState components"
```

---

### Task 2: Improve app layout header

**Files:**
- Modify: `app/layout.tsx`

Current `app/layout.tsx` only has a floating `LangToggle` in the top-right corner. We'll add a proper nav header.

- [ ] **Step 1: Read current file**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
cat app/layout.tsx
```

- [ ] **Step 2: Update `app/layout.tsx`**

Replace the entire file with:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { getLang } from "@/lib/lang/server";
import { LangToggle } from "@/components/LangToggle";
import { SignOutButton } from "@/components/ui/SignOutButton";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Big Fat Family Tree",
  description: "Preserving the El Zawaty family history",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <body className="bg-white text-gray-900 antialiased">
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-semibold text-gray-900 hover:text-amber-600 transition-colors">
            <span className="text-xl">🌳</span>
            <span className="hidden sm:block text-sm">
              {lang === "ar" ? "شجرة العائلة" : "Family Tree"}
            </span>
          </a>
          <div className="flex items-center gap-2">
            {user && (
              <a
                href="/admin"
                className="text-sm text-gray-400 hover:text-gray-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100 hidden sm:block"
              >
                {lang === "ar" ? "الإدارة" : "Admin"}
              </a>
            )}
            <LangToggle />
            {user && <SignOutButton lang={lang} />}
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add app/layout.tsx
git commit -m "feat(ui): sticky header with nav, sign-out button"
```

---

### Task 3: Home page empty state + improved labels

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Read current file**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
cat app/page.tsx
```

- [ ] **Step 2: Update `app/page.tsx`**

Replace the entire file with the version below. Key changes:
- Show `EmptyState` when no people exist, with a link to `/person/new`
- Add a visible "View as list / graph" label above the switcher on desktop
- Wrap the graph area in a rounded container with a subtle shadow

```tsx
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { buildGraphElements } from "@/lib/graph/transform";
import { FamilyGraph } from "@/components/graph/FamilyGraph";
import { PeopleList } from "@/components/PeopleList";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function HomePage() {
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const [{ data: people }, { data: relationships }] = await Promise.all([
    supabase
      .from("people")
      .select("*")
      .is("deleted_at", null)
      .order("given_en"),
    supabase.from("relationships").select("*"),
  ]);

  const isEmpty = !people || people.length === 0;

  if (isEmpty) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-16">
        <EmptyState
          icon="🌱"
          title={lang === "ar" ? "ابدأ شجرة عائلتك" : "Start your family tree"}
          description={
            lang === "ar"
              ? "لم يُضَف أي شخص بعد. ابدأ بإضافة أول فرد في العائلة."
              : "No family members added yet. Add the first person to get started."
          }
          action={
            <a
              href="/person/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors"
            >
              {lang === "ar" ? "＋ إضافة شخص" : "＋ Add person"}
            </a>
          }
        />
      </div>
    );
  }

  const { nodes, edges } = buildGraphElements(people, relationships ?? [], lang);

  return (
    <>
      {/* Desktop: graph */}
      <div className="hidden md:block h-[calc(100vh-57px)] bg-gray-50">
        <FamilyGraph nodes={nodes} edges={edges} />
      </div>

      {/* Mobile: list */}
      <div className="md:hidden px-4 py-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          {lang === "ar" ? "أفراد العائلة" : "Family members"}
        </h2>
        <PeopleList people={people} lang={lang} />
      </div>

      {/* FAB */}
      <a
        href="/person/new"
        className="fixed bottom-6 end-6 z-50 w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-600 shadow-lg flex items-center justify-center text-white text-2xl transition-colors"
        aria-label={lang === "ar" ? "إضافة شخص" : "Add person"}
      >
        ＋
      </a>
    </>
  );
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add app/page.tsx
git commit -m "feat(ui): home page empty state, bilingual FAB aria-label"
```

---

### Task 4: Person profile — notes section + initials fallback + relationships list

**Files:**
- Modify: `app/person/[id]/page.tsx`

- [ ] **Step 1: Read current file**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
cat "app/person/[id]/page.tsx"
```

- [ ] **Step 2: Update `app/person/[id]/page.tsx`**

Replace the entire file with:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { deletePerson } from "@/lib/actions/people";
import { createRelationship } from "@/lib/actions/relationships";
import { RelationshipForm } from "@/components/forms/RelationshipForm";

type Props = { params: Promise<{ id: string }> };

export default async function PersonPage({ params }: Props) {
  const { id } = await params;
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const [{ data: person }, { data: events }, { data: people }, { data: relationships }] =
    await Promise.all([
      supabase.from("people").select("*").eq("id", id).is("deleted_at", null).single(),
      supabase.from("events").select("*").eq("person_id", id).order("date_value", { ascending: true }),
      supabase
        .from("people")
        .select("id, given_en, given_ar, family_name_en, family_name_ar")
        .is("deleted_at", null)
        .neq("id", id),
      supabase
        .from("relationships")
        .select("*, person_a:people!relationships_person_a_id_fkey(id,given_en,given_ar), person_b:people!relationships_person_b_id_fkey(id,given_en,given_ar)")
        .or(`person_a_id.eq.${id},person_b_id.eq.${id}`),
    ]);

  if (!person) notFound();

  async function handleDelete() {
    "use server";
    await deletePerson(id);
  }

  const given =
    lang === "ar" ? (person.given_ar ?? person.given_en) : (person.given_en ?? person.given_ar);
  const fatherName =
    lang === "ar"
      ? (person.father_name_ar ?? person.father_name_en)
      : (person.father_name_en ?? person.father_name_ar);
  const grandfatherName =
    lang === "ar"
      ? (person.grandfather_name_ar ?? person.grandfather_name_en)
      : (person.grandfather_name_en ?? person.grandfather_name_ar);
  const familyName =
    lang === "ar"
      ? (person.family_name_ar ?? person.family_name_en)
      : (person.family_name_en ?? person.family_name_ar);
  const fullNameChain = [given, fatherName, grandfatherName, familyName].filter(Boolean).join(" ");
  const initials = (given ?? "?").slice(0, 2).toUpperCase();
  const notes = lang === "ar" ? (person.notes_ar ?? person.notes_en) : (person.notes_en ?? person.notes_ar);

  const eventTypeLabel: Record<string, { ar: string; en: string }> = {
    birth:         { ar: "الميلاد",    en: "Birth" },
    death:         { ar: "الوفاة",     en: "Death" },
    marriage:      { ar: "الزواج",     en: "Marriage" },
    divorce:       { ar: "الطلاق",     en: "Divorce" },
    engagement:    { ar: "الخطوبة",    en: "Engagement" },
    migration:     { ar: "الهجرة",     en: "Migration" },
    education:     { ar: "التعليم",    en: "Education" },
    notable_story: { ar: "قصة بارزة", en: "Notable Story" },
    custom:        { ar: "حدث",        en: "Event" },
  };

  const relTypeLabel: Record<string, { ar: string; en: string }> = {
    spouse:     { ar: "زوج/زوجة",       en: "Spouse" },
    adopted_by: { ar: "متبنَّى بواسطة", en: "Adopted by" },
    raised_by:  { ar: "تربى بواسطة",    en: "Raised by" },
    godparent:  { ar: "عرّاب",           en: "Godparent" },
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        {lang === "ar" ? "→ العودة" : "← Back"}
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        {person.photo_url ? (
          <img
            src={person.photo_url}
            alt={given ?? ""}
            className="w-20 h-20 rounded-full object-cover border-4 border-amber-100 shadow-sm"
          />
        ) : (
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold border-4 shadow-sm ${
              person.gender === "f"
                ? "bg-rose-50 border-rose-100 text-rose-400"
                : "bg-sky-50 border-sky-100 text-sky-400"
            }`}
          >
            {initials}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{given ?? "?"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{fullNameChain}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-8">
        <a
          href={`/person/${person.id}/edit`}
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          {lang === "ar" ? "✏️ تعديل" : "✏️ Edit"}
        </a>
        <form action={handleDelete}>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
            onClick={(e) => {
              if (!confirm(lang === "ar" ? "حذف هذا الشخص؟" : "Delete this person?"))
                e.preventDefault();
            }}
          >
            {lang === "ar" ? "🗑 حذف" : "🗑 Delete"}
          </button>
        </form>
      </div>

      {/* Notes */}
      {notes && (
        <section className="mb-8 p-4 bg-amber-50 rounded-xl border border-amber-100">
          <h2 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
            {lang === "ar" ? "ملاحظات" : "Notes"}
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{notes}</p>
        </section>
      )}

      {/* Timeline */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-700 mb-4">
          {lang === "ar" ? "الأحداث" : "Timeline"}
        </h2>
        {events && events.length > 0 ? (
          <ol className="relative border-s border-gray-200">
            {events.map((e) => {
              const label =
                lang === "ar"
                  ? (eventTypeLabel[e.type]?.ar ?? e.type)
                  : (eventTypeLabel[e.type]?.en ?? e.type);
              const story = lang === "ar" ? (e.story_ar ?? e.story_en) : (e.story_en ?? e.story_ar);
              return (
                <li key={e.id} className="ms-4 mb-6">
                  <div className="absolute w-2.5 h-2.5 bg-amber-400 rounded-full -start-1.5 top-1.5" />
                  <time className="text-xs text-gray-400">
                    {e.date_value ?? (lang === "ar" ? "تاريخ غير معروف" : "Date unknown")}
                    {(e.date_precision as string) !== "exact" && ` (${e.date_precision})`}
                  </time>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{label}</p>
                  {story && <p className="text-sm text-gray-600 mt-1">{story}</p>}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-gray-400">
            {lang === "ar" ? "لا توجد أحداث مسجّلة." : "No events recorded yet."}
          </p>
        )}
      </section>

      {/* Existing relationships list */}
      {relationships && relationships.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-700 mb-3">
            {lang === "ar" ? "العلاقات" : "Relationships"}
          </h2>
          <ul className="space-y-2">
            {relationships.map((r) => {
              const other = r.person_a_id === id
                ? (r.person_b as { id: string; given_en: string | null; given_ar: string | null } | null)
                : (r.person_a as { id: string; given_en: string | null; given_ar: string | null } | null);
              const otherName = other
                ? ((lang === "ar" ? other.given_ar ?? other.given_en : other.given_en ?? other.given_ar) ?? "?")
                : "?";
              const typeLabel =
                lang === "ar"
                  ? (relTypeLabel[r.type]?.ar ?? r.type)
                  : (relTypeLabel[r.type]?.en ?? r.type);
              return (
                <li key={r.id} className="flex items-center gap-3 text-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <a href={`/person/${other?.id}`} className="font-medium text-gray-800 hover:text-amber-600 transition-colors">
                    {otherName}
                  </a>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500">{typeLabel}</span>
                  {r.status !== "current" && (
                    <span className="text-xs text-gray-400">({r.status})</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Add relationship */}
      <section className="mt-4">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">
          {lang === "ar" ? "إضافة علاقة" : "Add relationship"}
        </h2>
        <RelationshipForm
          people={people ?? []}
          lang={lang}
          action={createRelationship.bind(null, person.id)}
        />
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Run typecheck + full test suite**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx tsc --noEmit && npx vitest run
```

Expected: no errors, all tests pass.

- [ ] **Step 4: Commit and push**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add app/person/ app/page.tsx app/layout.tsx
git commit -m "feat(ui): notes section, initials fallback, relationships list on profile"
git push
```
