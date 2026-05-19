# Milestone 8: Canvas v2 — Interactive Spatial Editing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Convert the read-only React Flow canvas into an interactive Miro-style workspace: drag nodes to reposition (persisted), drag handles to create relationships, right-click for contextual quick actions, manual auto-layout button.

**Architecture:** Position state lives on `people.pos_x / pos_y` (shared, single canonical layout, last-write-wins). The transform reads stored positions if present and falls back to dagre. A new client component `CanvasController` wraps `FamilyGraph` and owns interaction state (selected node, context-menu coords, quick-add dialog). Server Actions handle position writes and relationship creation; `router.refresh()` re-pulls authoritative state after each mutation.

**Tech Stack:** Next.js 16 Server Actions, React 19, `@xyflow/react` v12, Supabase SSR.

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260520000013_people_positions.sql` | **Create** | Add `pos_x`/`pos_y` to `people`; `canvas_viewport` jsonb to `profiles` |
| `lib/graph/transform.ts` | **Modify** | Honor stored positions if present, dagre only as fallback; export `autoLayout` |
| `lib/actions/canvas.ts` | **Create** | `updateNodePosition`, `autoLayoutPositions`, `saveViewport` server actions |
| `components/graph/CanvasController.tsx` | **Create** | Client wrapper owning interaction state (selection, menu, quick-add) |
| `components/graph/NodeContextMenu.tsx` | **Create** | Floating menu (Add child/spouse/parent, Edit, Delete) |
| `components/graph/QuickAddDialog.tsx` | **Create** | Inline person-add dialog opened from context menu |
| `components/graph/FamilyGraph.tsx` | **Modify** | Wire `onNodeDragStop`, `onConnect`, `onNodeContextMenu`, `onPaneContextMenu` |
| `components/graph/PersonNode.tsx` | **Modify** | Add `Handle` from `@xyflow/react` (top + bottom) for `onConnect` |
| `app/page.tsx` | **Modify** | Render `CanvasController` instead of bare `FamilyGraph`; add auto-layout button |
| `tests/smoke/graph-transform.test.ts` | **Modify** | Add tests for stored-position honoring + dagre fallback |

---

### Task 1: Migration — people positions + viewport

**Files:**
- Create: `supabase/migrations/20260520000013_people_positions.sql`

- [ ] **Step 1: Create migration file**

```sql
alter table public.people
  add column if not exists pos_x double precision,
  add column if not exists pos_y double precision;

alter table public.profiles
  add column if not exists canvas_viewport jsonb;

comment on column public.people.pos_x is 'Canvas X position; null = use dagre layout fallback';
comment on column public.people.pos_y is 'Canvas Y position; null = use dagre layout fallback';
comment on column public.profiles.canvas_viewport is '{ x, y, zoom } last camera state per user';
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__1fc8b5d6-0512-462f-88a0-13c96b9a561b__apply_migration`:
- `project_id`: `srmmatuyiybtgowwvixd`
- `name`: `people_positions`
- `query`: the SQL above

- [ ] **Step 3: Regenerate types**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
```

Use `mcp__1fc8b5d6-0512-462f-88a0-13c96b9a561b__generate_typescript_types` with `project_id=srmmatuyiybtgowwvixd`; overwrite `lib/db/types.ts` with the result.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520000013_people_positions.sql lib/db/types.ts
git commit -m "feat(db): pos_x/pos_y on people, canvas_viewport on profiles"
```

---

### Task 2: Transform — honor stored positions, add `autoLayout`

**Files:**
- Modify: `lib/graph/transform.ts`
- Modify: `tests/smoke/graph-transform.test.ts`

- [ ] **Step 1: Update `PersonInput` type to include positions**

In `lib/graph/transform.ts`:

```ts
export type PersonInput = {
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
  pos_x: number | null;
  pos_y: number | null;
};
```

- [ ] **Step 2: Update `buildGraphElements` to honor positions**

Replace the function body so it uses stored `pos_x`/`pos_y` when both are present, and ONLY runs dagre for the subset of nodes missing positions:

```ts
export function buildGraphElements(
  people: PersonInput[],
  relationships: RelationshipInput[],
  lang: Lang,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const idSet = new Set(people.map((p) => p.id));

  const nodes: GraphNode[] = people.map((p) => ({
    id: p.id,
    type: "person",
    data: { person: p, lang },
    position: { x: p.pos_x ?? 0, y: p.pos_y ?? 0 },
  }));

  const edges: GraphEdge[] = [];

  for (const p of people) {
    if (p.father_id && idSet.has(p.father_id)) {
      edges.push({ id: `f-${p.id}`, source: p.father_id, target: p.id, type: "smoothstep", data: { edgeKind: "parent" } });
    }
    if (p.mother_id && idSet.has(p.mother_id)) {
      edges.push({ id: `m-${p.id}`, source: p.mother_id, target: p.id, type: "smoothstep", data: { edgeKind: "parent" } });
    }
  }

  for (const r of relationships) {
    if (r.type === "spouse") {
      edges.push({
        id: `s-${r.person_a_id}-${r.person_b_id}`,
        source: r.person_a_id,
        target: r.person_b_id,
        type: "straight",
        data: { edgeKind: "spouse" },
        style: { stroke: "#f43f5e", strokeDasharray: "5 4", strokeWidth: 1.5 },
      });
    }
  }

  // Only nodes WITHOUT stored positions go through dagre
  const unpositioned = nodes.filter((n) => {
    const p = (n.data as PersonNodeData).person;
    return p.pos_x == null || p.pos_y == null;
  });

  if (unpositioned.length > 0) {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 90, marginx: 20, marginy: 20 });
    unpositioned.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
    edges
      .filter((e) => e.data?.edgeKind === "parent")
      .filter((e) => unpositioned.some((n) => n.id === e.source) && unpositioned.some((n) => n.id === e.target))
      .forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);
    unpositioned.forEach((n) => {
      const pos = g.node(n.id);
      if (pos) {
        n.position = { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 };
      }
    });
  }

  return { nodes, edges };
}
```

- [ ] **Step 3: Add `autoLayout` export**

After `buildGraphElements`, add:

```ts
export function autoLayoutPositions(
  people: PersonInput[],
): Map<string, { x: number; y: number }> {
  const idSet = new Set(people.map((p) => p.id));
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 90, marginx: 20, marginy: 20 });
  people.forEach((p) => g.setNode(p.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  for (const p of people) {
    if (p.father_id && idSet.has(p.father_id)) g.setEdge(p.father_id, p.id);
    if (p.mother_id && idSet.has(p.mother_id)) g.setEdge(p.mother_id, p.id);
  }
  dagre.layout(g);
  const out = new Map<string, { x: number; y: number }>();
  people.forEach((p) => {
    const pos = g.node(p.id);
    if (pos) out.set(p.id, { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 });
  });
  return out;
}
```

- [ ] **Step 4: Update tests — add `pos_x`/`pos_y` to every PersonInput fixture**

Update all existing fixtures in `tests/smoke/graph-transform.test.ts` so every person has `pos_x: null, pos_y: null` (test current dagre fallback path stays intact).

Then add two new tests at the end:

```ts
  it("honors stored positions when present", () => {
    const people = [
      { id: "p1", given_en: "A", given_ar: null, family_name_en: null, family_name_ar: null,
        father_id: null, mother_id: null, gender: "m" as const, is_placeholder: false, photo_url: null,
        pos_x: 100, pos_y: 200 },
    ];
    const { nodes } = buildGraphElements(people, [], "en");
    expect(nodes[0].position).toEqual({ x: 100, y: 200 });
  });

  it("autoLayoutPositions returns dagre coords for every person", () => {
    const people = [
      { id: "p1", given_en: "Parent", given_ar: null, family_name_en: null, family_name_ar: null,
        father_id: null, mother_id: null, gender: "m" as const, is_placeholder: false, photo_url: null,
        pos_x: null, pos_y: null },
      { id: "p2", given_en: "Child", given_ar: null, family_name_en: null, family_name_ar: null,
        father_id: "p1", mother_id: null, gender: "f" as const, is_placeholder: false, photo_url: null,
        pos_x: null, pos_y: null },
    ];
    const layout = autoLayoutPositions(people);
    expect(layout.size).toBe(2);
    expect(layout.get("p1")).toBeDefined();
    expect(layout.get("p2")).toBeDefined();
    // Parent above child under TB rankdir
    expect(layout.get("p1")!.y).toBeLessThan(layout.get("p2")!.y);
  });
```

Add the import at top of the test file: `import { buildGraphElements, autoLayoutPositions } from "@/lib/graph/transform";`

- [ ] **Step 5: Run tests**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree"
npx vitest run tests/smoke/graph-transform.test.ts
```

Expected: all tests pass (existing 7 + 2 new = 9).

- [ ] **Step 6: Commit**

```bash
git add lib/graph/transform.ts tests/smoke/graph-transform.test.ts
git commit -m "feat(graph): honor stored positions, autoLayoutPositions helper"
```

---

### Task 3: Canvas server actions

**Files:**
- Create: `lib/actions/canvas.ts`

- [ ] **Step 1: Create file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { autoLayoutPositions, type PersonInput } from "@/lib/graph/transform";

export async function updateNodePosition(id: string, x: number, y: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ pos_x: x, pos_y: y })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function saveViewport(viewport: { x: number; y: number; zoom: number }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not signed in." };
  const { error } = await supabase
    .from("profiles")
    .update({ canvas_viewport: viewport })
    .eq("id", user.id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function autoLayoutAll() {
  const supabase = await createClient();
  const { data: people, error: readErr } = await supabase
    .from("people")
    .select("id, given_en, given_ar, family_name_en, family_name_ar, father_id, mother_id, gender, is_placeholder, photo_url, pos_x, pos_y")
    .is("deleted_at", null);
  if (readErr || !people) return { success: false, error: readErr?.message ?? "Read failed." };

  const layout = autoLayoutPositions(people as PersonInput[]);
  const updates = [...layout.entries()].map(([id, { x, y }]) =>
    supabase.from("people").update({ pos_x: x, pos_y: y }).eq("id", id),
  );
  const results = await Promise.all(updates);
  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) return { success: false, error: firstErr.error.message };

  revalidatePath("/");
  return { success: true };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree" && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add lib/actions/canvas.ts
git commit -m "feat(actions): canvas position + viewport + auto-layout server actions"
```

---

### Task 4: PersonNode handles + context menu hookup

**Files:**
- Modify: `components/graph/PersonNode.tsx`

- [ ] **Step 1: Read current file**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree" && cat components/graph/PersonNode.tsx
```

- [ ] **Step 2: Add `Handle` imports and render handles**

Top imports change to:
```tsx
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
```

Inside the rendered card (both placeholder and real-person branches), add top + bottom handles wrapped around the existing content:

```tsx
<>
  <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-amber-400 !border-0" />
  {/* existing card markup */}
  <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-amber-400 !border-0" />
</>
```

(Use a fragment to wrap the existing return; do not nest the handles inside the `<Link>`.)

Also: change the outer `<Link>` to a `<div>` and move the navigation to the parent (CanvasController) via the `onNodeClick` handler we'll add in Task 6 — but since that may not exist yet in this task, keep the Link for now and add `onClick={(e) => e.stopPropagation()}` so the link doesn't intercept drag.

Wait — handles inside an `<a>` tag break drag. Reorganize:

```tsx
return (
  <div className="relative">
    <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-amber-400 !border-0" />
    <Link href={`/person/${person.id}`} onClick={(e) => e.stopPropagation()} className="...existing classes...">
      {/* existing inner content */}
    </Link>
    <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-amber-400 !border-0" />
  </div>
);
```

Apply the same to the placeholder branch (just wrap in a `<div className="relative">` with the two handles + the existing dashed-box markup).

- [ ] **Step 3: Typecheck + run all tests**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree" && npx tsc --noEmit 2>&1 | head -20 && npx vitest run 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
git add components/graph/PersonNode.tsx
git commit -m "feat(graph): add source/target handles to PersonNode for onConnect"
```

---

### Task 5: NodeContextMenu component

**Files:**
- Create: `components/graph/NodeContextMenu.tsx`

- [ ] **Step 1: Create file**

```tsx
"use client";

import { useEffect, useRef } from "react";

export type ContextMenuTarget =
  | { kind: "node"; personId: string; x: number; y: number }
  | { kind: "pane"; x: number; y: number };

type Props = {
  target: ContextMenuTarget;
  lang: "ar" | "en";
  onClose: () => void;
  onAddChild: () => void;
  onAddSpouse: () => void;
  onAddParent: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddPerson: () => void;
};

export function NodeContextMenu({
  target, lang, onClose,
  onAddChild, onAddSpouse, onAddParent, onEdit, onDelete, onAddPerson,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const item = "block w-full text-start px-3 py-2 text-sm hover:bg-amber-50 transition-colors";
  const danger = "block w-full text-start px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors";

  return (
    <div
      ref={ref}
      className="fixed z-[100] min-w-[180px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
      style={{ left: target.x, top: target.y }}
      role="menu"
    >
      {target.kind === "node" ? (
        <>
          <button onClick={onAddChild} className={item}>
            {lang === "ar" ? "إضافة ابن/ابنة" : "Add child"}
          </button>
          <button onClick={onAddSpouse} className={item}>
            {lang === "ar" ? "إضافة زوج/زوجة" : "Add spouse"}
          </button>
          <button onClick={onAddParent} className={item}>
            {lang === "ar" ? "إضافة والد/والدة" : "Add parent"}
          </button>
          <hr className="border-gray-100" />
          <button onClick={onEdit} className={item}>
            {lang === "ar" ? "تعديل" : "Edit"}
          </button>
          <button onClick={onDelete} className={danger}>
            {lang === "ar" ? "حذف" : "Delete"}
          </button>
        </>
      ) : (
        <button onClick={onAddPerson} className={item}>
          {lang === "ar" ? "＋ إضافة شخص" : "＋ Add person"}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree" && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add components/graph/NodeContextMenu.tsx
git commit -m "feat(graph): floating context menu for nodes and pane"
```

---

### Task 6: QuickAddDialog component

**Files:**
- Create: `components/graph/QuickAddDialog.tsx`

- [ ] **Step 1: Create file**

```tsx
"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions/people";
import { createPerson } from "@/lib/actions/people";

export type QuickAddRelation =
  | { kind: "child"; parentId: string; parentGender: "m" | "f" | "unknown" }
  | { kind: "parent"; childId: string; parentGender: "m" | "f" | "unknown" }
  | { kind: "spouse"; otherId: string }
  | { kind: "standalone" };

type Props = {
  relation: QuickAddRelation;
  lang: "ar" | "en";
  onClose: () => void;
};

function SubmitButton({ lang }: { lang: "ar" | "en" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
    >
      {pending ? (lang === "ar" ? "جاري الحفظ…" : "Saving…") : (lang === "ar" ? "حفظ" : "Save")}
    </button>
  );
}

export function QuickAddDialog({ relation, lang, onClose }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(createPerson, null);
  const firstInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstInput.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fatherId = relation.kind === "child" && relation.parentGender !== "f" ? relation.parentId : null;
  const motherId = relation.kind === "child" && relation.parentGender === "f" ? relation.parentId : null;

  const title =
    relation.kind === "child" ? (lang === "ar" ? "إضافة ابن/ابنة" : "Add child")
    : relation.kind === "parent" ? (lang === "ar" ? "إضافة والد/والدة" : "Add parent")
    : relation.kind === "spouse" ? (lang === "ar" ? "إضافة زوج/زوجة" : "Add spouse")
    : (lang === "ar" ? "إضافة شخص" : "Add person");

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
        <form action={formAction} className="space-y-3">
          {state?.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">{lang === "ar" ? "الاسم (إنجليزي)" : "Given name (EN)"}</label>
            <input
              ref={firstInput}
              name="given_en"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {state?.fieldErrors?.given_en && (
              <p className="text-xs text-red-500 mt-1">{state.fieldErrors.given_en}</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{lang === "ar" ? "الاسم (عربي)" : "Given name (AR)"}</label>
            <input
              name="given_ar"
              dir="rtl"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-2">{lang === "ar" ? "الجنس" : "Gender"}</label>
            <div className="flex gap-3">
              {(["f", "m", "unknown"] as const).map((g) => (
                <label key={g} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="radio" name="gender" value={g} defaultChecked={g === "unknown"} className="accent-amber-500" />
                  {g === "f" ? (lang === "ar" ? "أنثى" : "Female") : g === "m" ? (lang === "ar" ? "ذكر" : "Male") : (lang === "ar" ? "غير معروف" : "Unknown")}
                </label>
              ))}
            </div>
          </div>

          <input type="hidden" name="father_id" value={fatherId ?? ""} />
          <input type="hidden" name="mother_id" value={motherId ?? ""} />
          <input type="hidden" name="is_placeholder" value="false" />
          <input type="hidden" name="photo_url" value="" />
          <input type="hidden" name="father_name_en" value="" />
          <input type="hidden" name="father_name_ar" value="" />
          <input type="hidden" name="grandfather_name_en" value="" />
          <input type="hidden" name="grandfather_name_ar" value="" />
          <input type="hidden" name="great_grandfather_name_en" value="" />
          <input type="hidden" name="great_grandfather_name_ar" value="" />
          <input type="hidden" name="family_name_en" value="" />
          <input type="hidden" name="family_name_ar" value="" />
          <input type="hidden" name="notes_en" value="" />
          <input type="hidden" name="notes_ar" value="" />

          <div className="flex gap-2 justify-end pt-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </button>
            <SubmitButton lang={lang} />
          </div>
        </form>
      </div>
    </div>
  );
}
```

NOTE: This quick-add handles `child` (sets father_id/mother_id) and `standalone` cases inline. For `parent` and `spouse`, the dialog still creates the person; the parent/spouse RELATIONSHIP linking is wired in Task 7 via the controller calling `createRelationship` after the person is created.

For M8, simplify: `parent` and `spouse` create the new person standalone and then the user can drag-connect to set up the link visually. We'll improve in M11 polish.

- [ ] **Step 2: Typecheck**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree" && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add components/graph/QuickAddDialog.tsx
git commit -m "feat(graph): QuickAddDialog inline person-add modal"
```

---

### Task 7: CanvasController — interactive state owner

**Files:**
- Create: `components/graph/CanvasController.tsx`
- Modify: `components/graph/FamilyGraph.tsx`

- [ ] **Step 1: Update FamilyGraph to accept handlers**

Modify `components/graph/FamilyGraph.tsx`:

```tsx
"use client";

import {
  ReactFlow, Background, Controls, MiniMap,
  type NodeTypes, type Node, type Edge,
  type Connection, type NodeMouseHandler, type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PersonNode } from "./PersonNode";
import type { GraphNode, GraphEdge } from "@/lib/graph/transform";

const nodeTypes: NodeTypes = { person: PersonNode };

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeDragStop?: OnNodeDrag;
  onConnect?: (c: Connection) => void;
  onNodeContextMenu?: NodeMouseHandler;
  onPaneContextMenu?: (e: React.MouseEvent | MouseEvent) => void;
};

export function FamilyGraph({
  nodes, edges, onNodeDragStop, onConnect, onNodeContextMenu, onPaneContextMenu,
}: Props) {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes as Node[]}
        edges={edges as Edge[]}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
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

- [ ] **Step 2: Create CanvasController**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Connection, NodeMouseHandler, OnNodeDrag } from "@xyflow/react";
import { FamilyGraph } from "./FamilyGraph";
import { NodeContextMenu, type ContextMenuTarget } from "./NodeContextMenu";
import { QuickAddDialog, type QuickAddRelation } from "./QuickAddDialog";
import { updateNodePosition, autoLayoutAll } from "@/lib/actions/canvas";
import { createRelationship } from "@/lib/actions/relationships";
import { deletePerson } from "@/lib/actions/people";
import type { GraphNode, GraphEdge, PersonInput } from "@/lib/graph/transform";

type Props = {
  initialNodes: GraphNode[];
  initialEdges: GraphEdge[];
  people: PersonInput[];
  lang: "ar" | "en";
};

export function CanvasController({ initialNodes, initialEdges, people, lang }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [menu, setMenu] = useState<ContextMenuTarget | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddRelation | null>(null);

  const onNodeDragStop: OnNodeDrag = (_, node) => {
    startTransition(async () => {
      await updateNodePosition(node.id, node.position.x, node.position.y);
    });
  };

  const onConnect = (c: Connection) => {
    if (!c.source || !c.target) return;
    const fd = new FormData();
    fd.set("other_person_id", c.target);
    fd.set("type", "spouse");
    fd.set("status", "current");
    startTransition(async () => {
      await createRelationship(c.source!, null, fd);
      router.refresh();
    });
  };

  const onNodeContextMenu: NodeMouseHandler = (e, node) => {
    e.preventDefault();
    setMenu({ kind: "node", personId: node.id, x: e.clientX, y: e.clientY });
  };

  const onPaneContextMenu = (e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    setMenu({ kind: "pane", x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY });
  };

  function personById(id: string) {
    return people.find((p) => p.id === id);
  }

  function handleEdit() {
    if (menu?.kind !== "node") return;
    router.push(`/person/${menu.personId}/edit`);
  }

  function handleDelete() {
    if (menu?.kind !== "node") return;
    const confirmed = window.confirm(lang === "ar" ? "حذف هذا الشخص؟" : "Delete this person?");
    if (!confirmed) return;
    const id = menu.personId;
    setMenu(null);
    startTransition(async () => {
      await deletePerson(id);
      router.refresh();
    });
  }

  function handleAddChild() {
    if (menu?.kind !== "node") return;
    const parent = personById(menu.personId);
    if (!parent) return;
    setMenu(null);
    setQuickAdd({ kind: "child", parentId: parent.id, parentGender: parent.gender });
  }
  function handleAddSpouse() {
    if (menu?.kind !== "node") return;
    setMenu(null);
    setQuickAdd({ kind: "spouse", otherId: menu.personId });
  }
  function handleAddParent() {
    if (menu?.kind !== "node") return;
    setMenu(null);
    setQuickAdd({ kind: "parent", childId: menu.personId, parentGender: "unknown" });
  }
  function handleAddStandalone() {
    setMenu(null);
    setQuickAdd({ kind: "standalone" });
  }

  function handleAutoLayout() {
    startTransition(async () => {
      await autoLayoutAll();
      router.refresh();
    });
  }

  return (
    <>
      <FamilyGraph
        nodes={initialNodes}
        edges={initialEdges}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
      />

      {/* Auto-layout button */}
      <button
        onClick={handleAutoLayout}
        className="fixed bottom-6 start-6 z-40 px-4 py-2 rounded-xl bg-white border border-gray-200 shadow text-sm text-gray-700 hover:bg-amber-50 hover:border-amber-300 transition-colors"
        title={lang === "ar" ? "ترتيب تلقائي" : "Auto layout"}
      >
        {lang === "ar" ? "✨ ترتيب تلقائي" : "✨ Auto-layout"}
      </button>

      {menu && (
        <NodeContextMenu
          target={menu}
          lang={lang}
          onClose={() => setMenu(null)}
          onAddChild={handleAddChild}
          onAddSpouse={handleAddSpouse}
          onAddParent={handleAddParent}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAddPerson={handleAddStandalone}
        />
      )}

      {quickAdd && (
        <QuickAddDialog
          relation={quickAdd}
          lang={lang}
          onClose={() => {
            setQuickAdd(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree" && npx tsc --noEmit 2>&1 | head -30
```

Fix any errors.

- [ ] **Step 4: Commit**

```bash
git add components/graph/CanvasController.tsx components/graph/FamilyGraph.tsx
git commit -m "feat(graph): CanvasController owning drag/connect/context-menu state"
```

---

### Task 8: Wire CanvasController into home page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Update query to include positions**

Change the supabase query in `HomePage`:

```ts
supabase
  .from("people")
  .select("id, given_en, given_ar, family_name_en, family_name_ar, father_id, mother_id, gender, is_placeholder, photo_url, pos_x, pos_y")
  .is("deleted_at", null)
  .order("given_en"),
```

- [ ] **Step 2: Render CanvasController instead of FamilyGraph**

Replace the desktop graph block:

```tsx
{/* Desktop: interactive canvas */}
<div className="hidden md:block h-[calc(100vh-57px)] bg-gray-50">
  <CanvasController initialNodes={nodes} initialEdges={edges} people={people} lang={lang} />
</div>
```

Add the import:
```tsx
import { CanvasController } from "@/components/graph/CanvasController";
```

Remove the now-unused `FamilyGraph` import.

- [ ] **Step 3: Typecheck + full tests**

```bash
cd "/c/Users/hanan/Documents/Claude/Family Tree" && npx tsc --noEmit 2>&1 | head -20 && npx vitest run 2>&1 | tail -8
```

Expected: 0 type errors, all tests pass.

- [ ] **Step 4: Commit and push**

```bash
git add app/page.tsx
git commit -m "feat(canvas): home page uses interactive CanvasController"
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ Drag nodes → persisted (Tasks 1, 2, 3, 7)
- ✅ Drag handles to connect → relationship (Tasks 4, 7)
- ✅ Right-click context menu (Tasks 5, 7)
- ✅ Quick-add from context menu (Tasks 6, 7)
- ✅ Auto-layout button (Tasks 3, 7)
- ✅ Edit / Delete from canvas (Task 7)
- ✅ Bilingual labels throughout (Tasks 5, 6, 7)

**Future milestones (NOT in M8):**
- Live cursors / Realtime → M10
- Duplicate detection → M9
- Mobile bottom-sheet menu (currently right-click only works on desktop) → M11
- Inline editing on profile → M11
- Undo/redo → M11
- Onboarding wizard → M11
