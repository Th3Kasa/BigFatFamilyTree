# Code Review — Big Fat Family Tree

**Scope**: Canvas, graph transform, forms, pages, actions, shell, auth guards  
**Reviewer**: Claude Code (Senior Code Review pass)  
**Date**: 2026-05-22

---

## Issues

---

### CRITICAL

---

#### C-1 · `linkParentChild` sets wrong column — always writes `parentId` into itself

**File**: `lib/actions/people.ts:218`

```ts
const { error } = await supabase
  .from("people")
  .update({ [field]: parentId })   // BUG: should be parentId, but we just looked up parentId to get gender
  .eq("id", childId)
```

The `field` is correctly derived from the parent's gender (`father_id` or `mother_id`), but the value written is `parentId` — that part is correct. However the `.eq("id", childId)` means we are updating the child row. The bug is subtle but real: **the WHERE clause uses `childId` but there is no guard that `childId !== parentId`**, and more importantly there is no check that the child already has a parent in that slot. If someone drag-connects a node to itself (same ID for both handles), the query runs and silently corrupts data. `c.source === c.target` is checked in `onConnect` client-side but `linkParentChild` is a server action callable independently.

**Fix**: Add a server-side guard: `if (parentId === childId) return { success: false, error: "Cannot link a person as their own parent." };`

---

#### C-2 · `deletePerson` calls `redirect("/")` without checking if the deleted person's children still reference them — no orphan cleanup

**File**: `lib/actions/people.ts:230-241`

The soft-delete sets `deleted_at` but does not null out `father_id` / `mother_id` on child records. Subsequent page loads will include those dangling FK IDs in `PersonInput.father_id` / `mother_id`. The canvas `buildGraphElements` skips edges where the parent ID is not in `idSet` (safe), but the Inspector panel and profile page will show "Father: Unknown" for children of a deleted person instead of hiding the badge — minor UX, but the real risk is that `father_id` still contains the deleted UUID. If the soft-deleted record is ever hard-purged by a DB job, existing children silently lose their lineage.

**Fix**: Before or after the soft delete, run:
```ts
await supabase.from("people").update({ father_id: null }).eq("father_id", id);
await supabase.from("people").update({ mother_id: null }).eq("mother_id", id);
```

---

#### C-3 · Spouse-edge optimistic update has no rollback on failure

**File**: `components/graph/CanvasController.tsx:206-235`

The optimistic temp edge is inserted immediately into React Flow state. If `createRelationship` returns an error (`result?.id` falsy), the temp edge is left permanently in the canvas until the next `router.refresh()`. There is no cleanup path.

```ts
const result = await createRelationship(c.source!, null, fd);
if (result?.id) {
  // update edge id
} // else: temp edge stays forever in local state
```

**Fix**:
```ts
if (result?.id) {
  setEdges((eds) => eds.map((e) => ...));
} else {
  setEdges((eds) => eds.filter((e) => e.id !== tempId));
}
```

---

### HIGH

---

#### H-1 · `onEdgesDelete` fires `deleteRelationship` but parent-child edges (`edgeKind === "parent"`) have no delete handler

**File**: `components/graph/CanvasController.tsx:281-293`

Pressing `Delete` on a parent-child edge removes it from the React Flow canvas but there is no server action called — the underlying `father_id` / `mother_id` column is not cleared. The edge snaps back on the next `router.refresh()` because the DB record is unchanged.

**Fix**: Add a branch for `edgeKind === "parent"` that calls a server action to null out the appropriate parent column on the child record.

---

#### H-2 · `handleAddChild` gender-assignment logic is wrong for "unknown" gender spouse

**File**: `components/graph/CanvasController.tsx:310-311`

```ts
const fatherId = parent.gender !== "f" ? parent.id : (spouse?.gender !== "f" ? spouseId : parent.id);
const motherId = parent.gender === "f" ? parent.id : (spouse?.gender === "f" ? spouseId : spouseId);
```

When `parent.gender === "unknown"` the first ternary falls to the `else` branch (`parent.id` becomes father), which may be wrong. When both are `"unknown"` the motherId always becomes `spouseId` regardless of actual gender. The fallback in the `else` of `motherId` also always returns `spouseId` even when the parent is the mother — the logic duplicates rather than mirrors.

**Fix**: Use explicit gender checks and a clear default:
```ts
const fatherId = parent.gender === "m" ? parent.id : (spouse?.gender === "m" ? spouseId : parent.id);
const motherId = parent.gender === "f" ? parent.id : (spouse?.gender === "f" ? spouseId : undefined);
```

---

#### H-3 · `createPerson` calls `redirect()` inside `startTransition` in the new-person page but `redirect` throws — the error is uncaught client-side

**File**: `lib/actions/people.ts:85` used in `app/person/new/page.tsx`

`createPerson` ends with `redirect(...)` which throws a Next.js redirect error. When called as a Server Action bound to `useActionState`, this is handled correctly by Next.js. However `createPersonQuick` does NOT redirect (intentional, returns `{ success: true }`). The inconsistency is fine by itself, but `createPerson` redirects unconditionally even on first failure — if Zod validation fails it returns early, but on DB success it always redirects. The issue is that `revalidatePath("/")` is called before `redirect(...)`. If the redirect throws during streaming, the revalidation still happened. This is standard Next.js behavior, but means a failed redirect (e.g. middleware blocks it) leaves a stale revalidation with no user feedback.

This is low-risk in practice but worth knowing.

---

#### H-4 · `QuickAddDialog`: "Add parent" flow only ever sets `parentGender: "unknown"` — gender radio in the dialog has no effect on which FK column gets updated

**File**: `components/graph/CanvasController.tsx:325-328` and `lib/actions/people.ts:193-196`

When adding a parent via the context menu, `handleAddParent` always passes `parentGender: "unknown"`. The user selects a gender in the dialog, but `createPersonQuick` uses `parsed.data.gender` (the newly created person's gender) to decide `father_id` vs `mother_id`. This means a newly created female parent correctly writes `mother_id`, but only because the user picks "Female" in the radio — which is not labeled as "this person's gender", it's just the gender field. If the user leaves it on the default "Male" for a mother, the child gets a `father_id` instead.

The UX does not communicate that the gender radio controls which parent slot is filled.

**Fix**: In the "Add parent" dialog flow, expose clear labeling: "This person will be linked as: Father / Mother" — or derive it from the gender selection explicitly with a tooltip.

---

#### H-5 · `RelationshipForm`: `<option value={p.id}>` — `p.id` is typed as `string | undefined`

**File**: `components/forms/RelationshipForm.tsx:60`

`PersonOption.id` is `string | undefined`. The option's `value` will be the string `"undefined"` when `id` is missing, which will pass `UUID_RE` validation failure silently (returns "Invalid person ID.") but does not prevent the form from submitting with a nonsense value.

**Fix**: Filter the `people` list: `.filter((p) => p.id)` before mapping, or change the type to `id: string` (non-optional).

---

#### H-6 · `app/person/[id]/page.tsx` — parent links use raw `person.father_id` UUID as href, not slug

**File**: `app/person/[id]/page.tsx:414,422`

```tsx
<Link href={`/person/${person.father_id}`}>
<Link href={`/person/${person.mother_id}`}>
```

The page accepts both UUID and slug (`UUID_RE` check), but linking by UUID means the linked page URL is not canonical. If a person has a slug, linking to their UUID is a worse UX and inconsistent with everywhere else (which uses `slug ?? id`). More importantly, this only works if the page handles UUIDs — it does — but the inconsistency will confuse future developers.

**Fix**: Fetch the slug for `father_id` / `mother_id` and use `slug ?? id` in the link, or pass them through the existing `people` query that's already fetched on the same page.

---

### MEDIUM

---

#### M-1 · `spouseMap` in `buildGraphElements` only stores one spouse per person — silently drops polygamous or multi-relationship cases

**File**: `lib/graph/transform.ts:67-71`

```ts
spouseMap.set(r.person_a_id, r.person_b_id);
spouseMap.set(r.person_b_id, r.person_a_id);
```

If a person has two spouse relationships (e.g. divorced and remarried), the second `set` overwrites the first. The `spouseId` baked into node data will be whichever relationship appears last in the DB result. The "Add child" quick button in `PersonNode` then builds the wrong URL for the second marriage.

This is a design limitation worth noting in a comment at minimum.

---

#### M-2 · `CanvasController`: `useEffect` syncing `initialNodes`/`initialEdges` to state runs on every prop reference change

**File**: `components/graph/CanvasController.tsx:167-168`

```ts
useEffect(() => { setNodes(initialNodes as any[]); }, [initialNodes, setNodes]);
useEffect(() => { setEdges(initialEdges as any[]); }, [initialEdges, setEdges]);
```

`initialNodes` and `initialEdges` are arrays passed from the server component. On every `router.refresh()`, Next.js will recreate these arrays as new references even if the data is identical. This means every refresh triggers a full node/edge replace in React Flow, causing the canvas to flash/repaint unnecessarily. This also discards any optimistic state (e.g. the freshly-placed temp spouse edge is replaced before the next fetch has it).

**Fix**: Compare by serialized content or use a ref to track the previous value and only update on actual change.

---

#### M-3 · `updateNodePosition` is not debounced — every pixel of drag fires a server action

**File**: `components/graph/CanvasController.tsx:177-180`

`onNodeDragStop` is called once (on stop), so this is fine. However `onNodeDragStop` is wired to `onNodeDragStop` prop on `<FamilyGraph>` which passes it to ReactFlow. ReactFlow's `onNodeDragStop` is indeed called on mouse-up only. This is actually fine — noting it as a false alarm but flagging to confirm no throttling is needed.

**Status**: Not a bug. Remove from issues list.

---

#### M-4 · `autoLayoutAll` does N individual `UPDATE` queries — one per person

**File**: `lib/actions/canvas.ts:39-44`

```ts
const updates = [...layout.entries()].map(([id, { x, y }]) =>
  supabase.from("people").update({ pos_x: x, pos_y: y }).eq("id", id),
);
const results = await Promise.all(updates);
```

For 100 people this fires 100 concurrent queries. Supabase has connection pool limits. This works at small scale but will start throwing pool-exhaustion errors above ~50 concurrent requests.

**Fix**: Use a single `upsert` with all records, or batch into groups of 20.

---

#### M-5 · `PersonNode` placeholder renders only a `target` top handle and `source` bottom handle — left/right spouse handles are absent

**File**: `components/graph/PersonNode.tsx:32-48`

The placeholder branch returns early with only top and bottom handles. A placeholder node cannot be connected as a spouse via drag because there are no left/right handles. This is probably intentional (placeholders aren't real people), but it means the "Add info →" placeholder that gets created for missing parents can never be connected to a spouse visually, which may confuse users.

---

#### M-6 · `NodeContextMenu` positioned at raw `clientX/clientY` — no viewport overflow guard

**File**: `components/graph/NodeContextMenu.tsx:49`

```tsx
style={{ left: target.x, top: target.y }}
```

If a right-click happens near the right or bottom edge of the viewport, the menu clips off-screen. There is no clamp logic.

**Fix**: After rendering, measure the menu's bounding rect and adjust `left`/`top` if it exceeds `window.innerWidth` or `window.innerHeight`.

---

#### M-7 · `SubmitButton` in `PersonForm` always shows "Saving…" in English regardless of `lang`

**File**: `components/forms/PersonForm.tsx:57-59`

```ts
{pending ? "Saving…" : label}
```

The `lang` prop is not passed to `SubmitButton`. Arabic users see "Saving…" instead of "جاري الحفظ…".

**Fix**: Pass `lang` to `SubmitButton` and conditionally show the Arabic string.

---

#### M-8 · `birth_date` / `death_date` fields accept free text — no format enforcement

**File**: `components/forms/PersonForm.tsx:299-321` and `lib/validation/people.ts:24-25`

The schema accepts any string up to 20 chars. A user typing "12 March 1965" will pass validation, be stored in the DB, and then `String(person.birth_date).slice(0, 4)` on the profile page will show "12 M" as the year.

**Fix**: Either use `<input type="date">` or add a Zod regex: `z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "Use YYYY or YYYY-MM-DD")`.

---

### LOW

---

#### L-1 · `app/layout.tsx` — unauthenticated users see `{children}` without shell but there is no redirect to `/login`

**File**: `app/layout.tsx:59-72`

Non-authenticated users visiting `/` or any page get `children` rendered bare (no nav). The server components themselves do not guard against unauthenticated access — `app/page.tsx` queries the DB without checking `user`. If Supabase RLS is configured correctly this is safe from a data perspective, but a logged-out user on `/` will see an empty canvas or an empty state with a "+" link they cannot use, with no prompt to log in.

**Fix**: In `app/layout.tsx`, if `!user`, redirect to `/login` (or at minimum show the login page). Alternatively add auth middleware.

---

#### L-2 · `app/(auth)/login/page.tsx` — `handleResend` constructs a fake event object

**File**: `app/(auth)\login\page.tsx:170-172`

```ts
async function handleResend() {
  if (!canResend) return;
  await onSubmit({ preventDefault: () => {} } as React.FormEvent);
}
```

Passing a fake `React.FormEvent` cast works but is fragile. If `onSubmit` ever reads any other property from the event (e.g. `currentTarget`), this will throw at runtime.

**Fix**: Extract the OTP-send logic into a standalone async function and call it from both `onSubmit` and `handleResend`.

---

#### L-3 · `app/person/[id]/page.tsx` — inline server action `handleDelete` does not redirect after delete

**File**: `app/person/[id]/page.tsx:99-102`

```ts
async function handleDelete() {
  "use server";
  await deletePerson(person.id);
}
```

`deletePerson` already calls `redirect("/")` internally, so this works. But the inner `deletePerson` also calls `revalidatePath("/")` then `redirect("/")`. This is fine but the double-wrapping is unnecessary indirection. The real risk: `deletePerson` returns `{ success: false, error }` on DB error but `handleDelete` ignores the return value, so DB errors are silently swallowed — the user sees nothing.

**Fix**: Either propagate the error to the `DeletePersonButton` component via state, or let `deletePerson` throw on error rather than returning a value.

---

#### L-4 · `Inspector.tsx` — "Add child" button does not account for spouse (unlike `PersonNode`)

**File**: `components/graph/Inspector.tsx:162-168`

The Inspector's "Add child" link always uses the single-parent URL (`/person/new?father=X` or `mother=X`), while `PersonNode` correctly incorporates `spouseId` to build a two-parent URL. This is inconsistent — clicking "Add child" from the Inspector for a person who has a spouse on canvas will create a child with only one parent linked.

**Fix**: Pass `spouseId` through to `Inspector` (it's already in `PersonNodeData`) and build the same composite URL as `PersonNode`.

---

#### L-5 · RTL/Arabic: `←` back arrow is hardcoded LTR in multiple pages

**Files**:
- `app/person/new/page.tsx:53`
- `app/person/[id]/page.tsx:167`
- `app/admin/layout.tsx:22`

```tsx
<span aria-hidden>←</span>
```

In RTL mode (`dir="rtl"`) this arrow should be `→`. The `html` element has `dir="rtl"` when Arabic, but these inline `span` elements with a hardcoded Unicode arrow do not flip with CSS `direction`.

**Fix**: Use `lang === "ar" ? "→" : "←"` or use a CSS logical property with `rotate(180deg)` on an SVG arrow icon when RTL.

---

#### L-6 · `autoLayoutAll` in `canvas.ts` does not select the `slug` column — `autoLayoutPositions` doesn't need it, but `PersonInput` type requires `slug`

**File**: `lib/actions/canvas.ts:33-35`

The select list omits `slug` but the result is cast to `PersonInput[]` which has `slug: string | null`. TypeScript will not catch this because of the `as` cast. At runtime `p.slug` will be `undefined` (not `null`) for all people fetched by this action. This propagates if `autoLayoutPositions` ever reads `slug`.

**Fix**: Add `slug` to the select list, or use a narrower type for this query.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High     | 6 |
| Medium   | 7 (1 retracted as non-bug) |
| Low      | 6 |
| **Total** | **22** |

---

## Top 3 Most Important Fixes

**1. C-3 — Orphaned temp spouse edge on failure (Critical UX corruption)**  
An edge appears in the canvas that has no backing DB record, and it persists indefinitely. This will confuse users and break subsequent edge-delete attempts (no `relationshipId` to delete). One-line fix in `CanvasController.tsx`.

**2. H-1 — Deleting a parent-child edge on canvas does nothing server-side (High data integrity)**  
The user believes they've unlinked a parent-child relationship. The DB says otherwise. After any refresh the edge reappears. This breaks the core genealogy editing workflow.

**3. C-2 — Soft-deleting a person leaves dangling `father_id`/`mother_id` on children (Critical data integrity)**  
Children of a deleted person permanently carry a stale UUID in their parent columns. This affects Inspector display ("Unknown" parent badges) and will corrupt data if hard deletes ever run. Two additional `UPDATE` queries in `deletePerson` fix it completely.
