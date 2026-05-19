# Milestone 3: Read-Only Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder home page with a live force-directed family graph fed from Supabase, add a `/person/[id]` profile page with a timeline, AR/EN language toggle with RTL support, and a mobile list fallback.

**Architecture:** Server components fetch `people` + `relationships` from Supabase, transform them into React Flow nodes/edges using a dagre hierarchical layout, then pass the result to a `"use client"` graph wrapper. Language preference is stored in a cookie (`lang=ar|en`) read server-side so the initial HTML render is already in the correct language and direction. Mobile devices get a list view (graph is hidden via CSS breakpoint).

**Tech Stack:** Next.js 16 App Router, `@xyflow/react` v12 (React Flow), `@dagrejs/dagre` (layout), Tailwind CSS v4, Supabase SSR client, Vitest.

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `lib/lang/server.ts` | **Create** | Read `lang` cookie server-side, return `"ar" \| "en"` |
| `lib/graph/transform.ts` | **Create** | Convert people + relationships arrays → ReactFlow nodes + edges with dagre layout |
| `components/graph/PersonNode.tsx` | **Create** | Custom ReactFlow node — bilingual name, gender colour, link to profile |
| `components/graph/FamilyGraph.tsx` | **Create** | `"use client"` ReactFlow wrapper with Background, Controls, MiniMap |
| `components/PeopleList.tsx` | **Create** | Mobile list, grouped by family name |
| `components/LangToggle.tsx` | **Create** | `"use client"` button that writes `lang` cookie and reloads |
| `app/layout.tsx` | **Modify** | Add `lang`/`dir` attrs, render LangToggle in header |
| `app/page.tsx` | **Modify** | Server component: fetch data, build graph elements, render graph + list |
| `app/person/[id]/page.tsx` | **Create** | Profile page: name chain, timeline of events |
| `tests/smoke/graph-transform.test.ts` | **Create** | Unit tests for `buildGraphElements` |
| `middleware.ts` | **Modify** | Widen CSP `connect-src` to allow React Flow blob: worker |

---

### Task 1: Install packages

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npm install @xyflow/react @dagrejs/dagre
```

Expected output includes lines like:
```
added 2 packages
```

- [ ] **Step 2: Verify types available**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
node -e "require('@dagrejs/dagre'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add package.json package-lock.json
git commit -m "chore: add @xyflow/react and @dagrejs/dagre"
```

---

### Task 2: Language cookie helper

**Files:**
- Create: `lib/lang/server.ts`
- Test: `tests/smoke/lang.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/smoke/lang.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the pure parsing logic extracted from getLang
// getLang itself calls next/headers which is unavailable in vitest.
// So we test a pure helper that getLang delegates to.
import { parseLang } from "@/lib/lang/server";

describe("parseLang", () => {
  it("returns 'en' when cookie is absent", () => {
    expect(parseLang(undefined)).toBe("en");
  });

  it("returns 'ar' when cookie value is 'ar'", () => {
    expect(parseLang("ar")).toBe("ar");
  });

  it("returns 'en' for any other value", () => {
    expect(parseLang("fr")).toBe("en");
    expect(parseLang("")).toBe("en");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx vitest run tests/smoke/lang.test.ts
```

Expected: FAIL — `parseLang` not found.

- [ ] **Step 3: Create `lib/lang/server.ts`**

```ts
import { cookies } from "next/headers";

export type Lang = "ar" | "en";

export function parseLang(value: string | undefined): Lang {
  return value === "ar" ? "ar" : "en";
}

export async function getLang(): Promise<Lang> {
  const store = await cookies();
  return parseLang(store.get("lang")?.value);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx vitest run tests/smoke/lang.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add lib/lang/server.ts tests/smoke/lang.test.ts
git commit -m "feat(lang): cookie-based lang helper with parseLang unit tests"
```

---

### Task 3: Graph transform with dagre layout

**Files:**
- Create: `lib/graph/transform.ts`
- Test: `tests/smoke/graph-transform.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/smoke/graph-transform.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildGraphElements } from "@/lib/graph/transform";

const people = [
  {
    id: "p1", given_en: "Alice", given_ar: "أليس",
    family_name_en: "Smith", family_name_ar: "سميث",
    father_id: null, mother_id: null,
    gender: "f" as const, is_placeholder: false, photo_url: null,
  },
  {
    id: "p2", given_en: null, given_ar: null,
    family_name_en: null, family_name_ar: null,
    father_id: null, mother_id: null,
    gender: "m" as const, is_placeholder: true, photo_url: null,
  },
  {
    id: "p3", given_en: "Carol", given_ar: "كارول",
    family_name_en: "Smith", family_name_ar: "سميث",
    father_id: "p2", mother_id: "p1",
    gender: "f" as const, is_placeholder: false, photo_url: null,
  },
];

const relationships = [
  { id: "r1", person_a_id: "p1", person_b_id: "p2", type: "spouse" as const, status: "current" as const, order_index: 1 },
];

describe("buildGraphElements", () => {
  it("creates one node per person", () => {
    const { nodes } = buildGraphElements(people, relationships, "en");
    expect(nodes).toHaveLength(3);
    expect(nodes.map((n) => n.id)).toContain("p1");
  });

  it("node data carries person and lang", () => {
    const { nodes } = buildGraphElements(people, relationships, "ar");
    const n = nodes.find((n) => n.id === "p1")!;
    expect(n.data.person.id).toBe("p1");
    expect(n.data.lang).toBe("ar");
  });

  it("creates father_id edge as f-<child>", () => {
    const { edges } = buildGraphElements(people, relationships, "en");
    expect(edges.find((e) => e.id === "f-p3")).toBeDefined();
  });

  it("creates mother_id edge as m-<child>", () => {
    const { edges } = buildGraphElements(people, relationships, "en");
    expect(edges.find((e) => e.id === "m-p3")).toBeDefined();
  });

  it("creates spouse edge from relationships", () => {
    const { edges } = buildGraphElements(people, relationships, "en");
    expect(edges.find((e) => e.id === "s-p1-p2")).toBeDefined();
  });

  it("dagre assigns numeric positions to all nodes", () => {
    const { nodes } = buildGraphElements(people, relationships, "en");
    for (const n of nodes) {
      expect(typeof n.position.x).toBe("number");
      expect(typeof n.position.y).toBe("number");
      expect(isNaN(n.position.x)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx vitest run tests/smoke/graph-transform.test.ts
```

Expected: FAIL — `buildGraphElements` not found.

- [ ] **Step 3: Create `lib/graph/transform.ts`**

```ts
import dagre from "@dagrejs/dagre";
import type { Lang } from "@/lib/lang/server";

const NODE_WIDTH = 160;
const NODE_HEIGHT = 80;

type PersonInput = {
  id: string;
  given_en: string | null;
  given_ar: string | null;
  family_name_en: string | null;
  family_name_ar: string | null;
  father_id: string | null;
  mother_id: string | null;
  gender: "m" | "f" | "unknown";
  is_placeholder: boolean;
  photo_url: string | null;
};

type RelationshipInput = {
  id: string;
  person_a_id: string;
  person_b_id: string;
  type: "spouse" | "adopted_by" | "raised_by" | "godparent";
  status: "current" | "divorced" | "widowed";
  order_index: number;
};

export type PersonNodeData = {
  person: PersonInput;
  lang: Lang;
};

export type GraphNode = {
  id: string;
  type: "person";
  data: PersonNodeData;
  position: { x: number; y: number };
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: "smoothstep" | "straight";
  style?: React.CSSProperties;
  animated?: boolean;
};

export function buildGraphElements(
  people: PersonInput[],
  relationships: RelationshipInput[],
  lang: Lang,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // Build id set for existence checks
  const idSet = new Set(people.map((p) => p.id));

  const nodes: GraphNode[] = people.map((p) => ({
    id: p.id,
    type: "person",
    data: { person: p, lang },
    position: { x: 0, y: 0 }, // dagre overwrites this
  }));

  const edges: GraphEdge[] = [];

  // Parent-child edges
  for (const p of people) {
    if (p.father_id && idSet.has(p.father_id)) {
      edges.push({ id: `f-${p.id}`, source: p.father_id, target: p.id, type: "smoothstep" });
    }
    if (p.mother_id && idSet.has(p.mother_id)) {
      edges.push({ id: `m-${p.id}`, source: p.mother_id, target: p.id, type: "smoothstep" });
    }
  }

  // Spouse edges (dashed, bidirectional visual only)
  for (const r of relationships) {
    if (r.type === "spouse") {
      edges.push({
        id: `s-${r.person_a_id}-${r.person_b_id}`,
        source: r.person_a_id,
        target: r.person_b_id,
        type: "straight",
        style: { stroke: "#f43f5e", strokeDasharray: "5 4", strokeWidth: 1.5 },
      });
    }
  }

  // Dagre layout — only feed hierarchical (parent-child) edges to avoid cycles
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 90, marginx: 20, marginy: 20 });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges
    .filter((e) => e.type === "smoothstep") // only parent-child for layout
    .forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  nodes.forEach((n) => {
    const pos = g.node(n.id);
    if (pos) {
      n.position = { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 };
    }
  });

  return { nodes, edges };
}
```

Note: The `React.CSSProperties` type reference in `GraphEdge` requires adding `import type React from "react"` at the top. Add it:

```ts
import type React from "react";
import dagre from "@dagrejs/dagre";
import type { Lang } from "@/lib/lang/server";
// ... rest unchanged
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx vitest run tests/smoke/graph-transform.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add lib/graph/transform.ts tests/smoke/graph-transform.test.ts
git commit -m "feat(graph): buildGraphElements with dagre layout + 6 unit tests"
```

---

### Task 4: PersonNode component

**Files:**
- Create: `components/graph/PersonNode.tsx`

No unit test needed — this is a pure React component that renders differently based on props. Visual output is verified by running the dev server in Task 8.

- [ ] **Step 1: Create `components/graph/PersonNode.tsx`**

```tsx
"use client";

import Link from "next/link";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { PersonNodeData, GraphNode } from "@/lib/graph/transform";

export function PersonNode({ data }: NodeProps<GraphNode>) {
  const { person, lang } = data as PersonNodeData;

  const name =
    lang === "ar"
      ? (person.given_ar ?? person.given_en ?? "?")
      : (person.given_en ?? person.given_ar ?? "?");

  const family =
    lang === "ar"
      ? (person.family_name_ar ?? person.family_name_en ?? "")
      : (person.family_name_en ?? person.family_name_ar ?? "");

  if (person.is_placeholder) {
    return (
      <>
        <Handle type="target" position={Position.Top} />
        <div className="w-40 h-20 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
          <span className="text-gray-400 text-xs">Unknown</span>
        </div>
        <Handle type="source" position={Position.Bottom} />
      </>
    );
  }

  const borderColor = person.gender === "f" ? "border-rose-300" : "border-sky-300";

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <Link href={`/person/${person.id}`} className="block no-underline">
        <div
          className={`w-40 h-20 rounded-lg border-2 ${borderColor} bg-white shadow-sm hover:shadow-md hover:border-amber-400 transition-all p-2 flex flex-col items-center justify-center gap-1`}
        >
          {person.photo_url ? (
            <img
              src={person.photo_url}
              alt={name}
              className="w-7 h-7 rounded-full object-cover"
            />
          ) : (
            <span className="text-base leading-none">
              {person.gender === "f" ? "👩" : "👨"}
            </span>
          )}
          <p className="text-xs font-semibold text-gray-800 truncate max-w-full text-center leading-tight">
            {name}
          </p>
          {family && (
            <p className="text-[10px] text-gray-400 truncate max-w-full text-center leading-tight">
              {family}
            </p>
          )}
        </div>
      </Link>
      <Handle type="source" position={Position.Bottom} />
    </>
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
git add components/graph/PersonNode.tsx
git commit -m "feat(graph): PersonNode component with bilingual name, gender styling"
```

---

### Task 5: FamilyGraph client component

**Files:**
- Create: `components/graph/FamilyGraph.tsx`

- [ ] **Step 1: Create `components/graph/FamilyGraph.tsx`**

```tsx
"use client";

import { ReactFlow, Background, Controls, MiniMap, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PersonNode } from "./PersonNode";
import type { GraphNode, GraphEdge } from "@/lib/graph/transform";

const nodeTypes: NodeTypes = { person: PersonNode };

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export function FamilyGraph({ nodes, edges }: Props) {
  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={20} size={1} color="#e5e7eb" />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as { person?: { gender?: string; is_placeholder?: boolean } };
            if (d.person?.is_placeholder) return "#e5e7eb";
            return d.person?.gender === "f" ? "#fda4af" : "#93c5fd";
          }}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
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
git add components/graph/FamilyGraph.tsx
git commit -m "feat(graph): FamilyGraph client component with ReactFlow, MiniMap, Controls"
```

---

### Task 6: PeopleList mobile component

**Files:**
- Create: `components/PeopleList.tsx`

- [ ] **Step 1: Create `components/PeopleList.tsx`**

```tsx
import Link from "next/link";
import type { Lang } from "@/lib/lang/server";
import type { Database } from "@/lib/db/types";

type PersonRow = Pick<
  Database["public"]["Tables"]["people"]["Row"],
  "id" | "given_ar" | "given_en" | "family_name_ar" | "family_name_en" | "gender" | "is_placeholder"
>;

type Props = {
  people: PersonRow[];
  lang: Lang;
};

export function PeopleList({ people, lang }: Props) {
  // Group real people by family name; skip placeholders
  const groups = new Map<string, PersonRow[]>();
  for (const p of people) {
    if (p.is_placeholder) continue;
    const key =
      (lang === "ar" ? p.family_name_ar : p.family_name_en) ??
      (lang === "ar" ? p.family_name_en : p.family_name_ar) ??
      "—";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  return (
    <main className="p-4 pb-20">
      <h1 className="text-xl font-bold mb-4">
        {lang === "ar" ? "شجرة العائلة" : "Family Tree"}
      </h1>
      {[...groups.entries()].map(([group, members]) => (
        <section key={group} className="mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 px-1">
            {group}
          </h2>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
            {members.map((p) => {
              const name =
                lang === "ar"
                  ? (p.given_ar ?? p.given_en ?? "?")
                  : (p.given_en ?? p.given_ar ?? "?");
              return (
                <li key={p.id}>
                  <Link
                    href={`/person/${p.id}`}
                    className="flex items-center gap-3 py-3 px-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    <span className="text-xl leading-none shrink-0">
                      {p.gender === "f" ? "👩" : "👨"}
                    </span>
                    <span className="text-sm text-gray-800">{name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
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
git add components/PeopleList.tsx
git commit -m "feat(ui): PeopleList mobile component grouped by family name"
```

---

### Task 7: LangToggle + update layout

**Files:**
- Create: `components/LangToggle.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create `components/LangToggle.tsx`**

```tsx
"use client";

import type { Lang } from "@/lib/lang/server";

type Props = { current: Lang };

export function LangToggle({ current }: Props) {
  function toggle() {
    const next = current === "ar" ? "en" : "ar";
    document.cookie = `lang=${next}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  }

  return (
    <button
      onClick={toggle}
      className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 bg-white hover:bg-gray-50 active:bg-gray-100 shadow-sm transition-colors"
      aria-label={current === "ar" ? "Switch to English" : "التبديل إلى العربية"}
    >
      {current === "ar" ? "English" : "عربي"}
    </button>
  );
}
```

- [ ] **Step 2: Update `app/layout.tsx`**

Replace the entire file:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { getLang } from "@/lib/lang/server";
import { LangToggle } from "@/components/LangToggle";

export const metadata: Metadata = {
  title: "Big Fat Family Tree",
  description: "Family knowledge preserved.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <body>
        <div className="fixed top-3 end-3 z-50">
          <LangToggle current={lang} />
        </div>
        {children}
      </body>
    </html>
  );
}
```

Note: `end-3` is the logical-property equivalent of `right-3` in LTR and `left-3` in RTL — correct for both directions.

- [ ] **Step 3: Run typecheck**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add components/LangToggle.tsx app/layout.tsx
git commit -m "feat(i18n): LangToggle + RTL-aware layout with lang/dir cookie"
```

---

### Task 8: Wire home page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { buildGraphElements } from "@/lib/graph/transform";
import { FamilyGraph } from "@/components/graph/FamilyGraph";
import { PeopleList } from "@/components/PeopleList";

export default async function Home() {
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const [{ data: people, error: peopleErr }, { data: relationships, error: relErr }] =
    await Promise.all([
      supabase
        .from("people")
        .select(
          "id, given_ar, given_en, family_name_ar, family_name_en, father_id, mother_id, gender, is_placeholder, photo_url",
        )
        .is("deleted_at", null),
      supabase
        .from("relationships")
        .select("id, person_a_id, person_b_id, type, status, order_index"),
    ]);

  if (peopleErr) throw peopleErr;
  if (relErr) throw relErr;

  const { nodes, edges } = buildGraphElements(people ?? [], relationships ?? [], lang);

  return (
    <>
      {/* Desktop: full-screen graph */}
      <div className="hidden md:block">
        <FamilyGraph nodes={nodes} edges={edges} />
      </div>
      {/* Mobile: grouped list */}
      <div className="md:hidden">
        <PeopleList people={people ?? []} lang={lang} />
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

Expected: no errors.

- [ ] **Step 3: Start dev server and verify visually**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npm run dev
```

Open http://localhost:3000 (after logging in). Expected:
- Desktop: ReactFlow canvas showing Marcelle node (pink border) connected by dashed line to the placeholder husband node (dashed border).
- MiniMap visible in corner.
- LangToggle button in top-right corner.
- Clicking "عربي" reloads page with Arabic name "مارسيل" and `dir="rtl"`.

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add app/page.tsx
git commit -m "feat: home page — live family graph from Supabase, mobile list fallback"
```

---

### Task 9: Profile page `/person/[id]`

**Files:**
- Create: `app/person/[id]/page.tsx`

- [ ] **Step 1: Create `app/person/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";

type Props = { params: Promise<{ id: string }> };

export default async function PersonPage({ params }: Props) {
  const { id } = await params;
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const [{ data: person }, { data: events }] = await Promise.all([
    supabase
      .from("people")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("events")
      .select("*")
      .eq("person_id", id)
      .order("date_value", { ascending: true }),
  ]);

  if (!person) notFound();

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

  const fullNameChain = [given, fatherName, grandfatherName, familyName]
    .filter(Boolean)
    .join(" ");

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

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        ← {lang === "ar" ? "العودة" : "Back"}
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        {person.photo_url ? (
          <img
            src={person.photo_url}
            alt={given ?? ""}
            className="w-20 h-20 rounded-full object-cover border-4 border-amber-100"
          />
        ) : (
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl border-4 ${
              person.gender === "f" ? "bg-rose-50 border-rose-100" : "bg-sky-50 border-sky-100"
            }`}
          >
            {person.gender === "f" ? "👩" : "👨"}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{given ?? "?"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{fullNameChain}</p>
        </div>
      </div>

      {/* Timeline */}
      <section>
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
                    {e.date_precision !== "exact" && ` (${e.date_precision})`}
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
    </main>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify in browser**

With dev server running, click on Marcelle's node in the graph.
Expected:
- URL: `/person/aaaaaaaa-0000-0000-0000-000000000001`
- Shows name "Marcelle" (or "مارسيل" in AR mode)
- Full name chain: "Marcelle Gaballah Shahata El Zawaty"
- Timeline section with birth event (year precision)
- Back link returns to graph

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add app/person/
git commit -m "feat: /person/[id] profile page with bilingual name chain and timeline"
```

---

### Task 10: CSP + full test run + push

**Files:**
- Modify: `middleware.ts` (CSP update for React Flow blob workers)

React Flow uses a Web Worker via a blob URL for layout operations in some modes. The existing CSP needs `worker-src blob:` added.

- [ ] **Step 1: Update CSP in `middleware.ts`**

Find this line in `middleware.ts`:

```ts
    "Content-Security-Policy",
    `default-src 'self'; img-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://*.upstash.io; font-src 'self' data:; frame-ancestors 'none'`,
```

Replace with:

```ts
    "Content-Security-Policy",
    `default-src 'self'; img-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://*.upstash.io; font-src 'self' data:; worker-src blob:; frame-ancestors 'none'`,
```

- [ ] **Step 2: Run full test suite**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx vitest run
```

Expected: all tests pass (smoke/env, smoke/middleware, smoke/ratelimit, smoke/db-types, smoke/lang, smoke/graph-transform).

- [ ] **Step 3: Run typecheck**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit and push**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
git add middleware.ts
git commit -m "fix(csp): add worker-src blob: for React Flow"
git push
```

Expected: push succeeds, Vercel deployment triggered automatically.

---

## Self-Review

**Spec coverage:**
- ✅ Force-directed / hierarchical graph on `/` — Task 5, 8
- ✅ Custom PersonNode with bilingual name — Task 4
- ✅ Data from real Supabase people + relationships — Task 8
- ✅ `/person/[id]` profile page — Task 9
- ✅ Full name chain (given + father + grandfather + family) — Task 9
- ✅ Timeline tab with events — Task 9
- ✅ AR/EN language toggle — Task 7
- ✅ RTL support (`dir="rtl"` on `<html>`) — Task 7
- ✅ Mobile list view grouped by family — Task 6
- ✅ Graph hidden on mobile — Task 8

**No placeholders:** All steps contain complete code.

**Type consistency:** `PersonNodeData` defined in `lib/graph/transform.ts` and imported by `PersonNode.tsx`. `GraphNode`/`GraphEdge` types flow from transform → FamilyGraph. `Lang` from `lib/lang/server.ts` used throughout.
