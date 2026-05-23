# Auto-Layout v2 — Sugiyama-Style Family Tree Layout

**Status:** Design (no code yet)
**Owner (design):** saas-architect
**Implementers:** ai-automation + web-builder
**Reviewer:** Alfred
**Flag:** `?layout=v2`

---

## 1. Why v2

The current `autoLayoutPositions` (lib/graph/transform.ts:177-196) feeds Dagre only parent edges, ignoring marriages entirely. Spouse edges are drawn as straight lines AFTER layout (transform.ts:135-171). Symptoms:

- Spouses land in arbitrary positions, often far apart.
- Children of two parents land under one parent, never the midpoint.
- Hardcoded `nodesep: 50/60`, `ranksep: 90` produce cramped overlap with NODE_WIDTH=220.
- No reservation for child-drop routes — parent edges cross spouse edges.

We need true Sugiyama-style hierarchical layout with **couple compounding** and **midpoint anchoring** for two-parent children.

---

## 2. Architecture Decision Summary

| # | Question | Decision |
|---|----------|----------|
| 1 | Couple compounding | **Compound `current` couples only.** Divorced/widowed remain individual layout units. |
| 2 | Two-parent child anchoring | **Virtual midpoint node** (rank between parent and child rows, zero-width). |
| 3 | Multi-depth nodes (cousin marriage) | **Promote node to highest (shallowest) generational rank**, draw the spouse edge across ranks with a dedicated "skip" style. |
| 4 | Edge lanes | **Reserved orthogonal lane = `ranksep / 2`** between every generation row. |
| 5 | Spacing | `nodeWidth=220, nodeHeight=240, nodesep=80, ranksep=180, edgesep=24, coupleGap=24` |
| 6 | Incremental layout | **Local re-layout** for "add child of known parents"; **full re-layout** for "add ancestor / merge subtree / first marriage". |
| 7 | Feature flag | `?layout=v2` read in tree page server component, threaded into `buildGraphElements(..., { layout: 'v1' \| 'v2' })`. |
| 8 | Persistence | v2 writes back **only on explicit "Auto Layout" button**, with a confirm modal if any `pos_x` is non-null. Initial render with all-null positions writes back silently. |
| 9 | Edge routing | **Custom React Flow edge for couples** (horizontal bar with center tee), `smoothstep` for parent→child via virtual midpoint, `straight` only for cross-rank cousin-marriage skips. |
| 10 | Algorithm | **Build a couple-compounding pre-pass on top of Dagre.** Reject ELK swap (extra 200KB, async API, no current pain Dagre can't solve once we feed it correct graph). |

---

## 3. Pipeline

```
 people[], relationships[]
        │
        ▼
 ┌─────────────────────────────┐
 │ 1. CLASSIFY                 │
 │  - build spouseMap           │
 │  - mark current/ex couples   │
 │  - find two-parent children  │
 └────────────┬────────────────┘
              │
              ▼
 ┌─────────────────────────────┐
 │ 2. COMPOUND                 │
 │  for each current couple:    │
 │    create couple-unit (CU)   │
 │    width = 2W + coupleGap    │
 └────────────┬────────────────┘
              │
              ▼
 ┌─────────────────────────────┐
 │ 3. INSERT VIRTUAL MIDPOINTS │
 │  for each child with both    │
 │  parents present:            │
 │    midNode m(c)              │
 │    edge CU(parents) → m(c)   │
 │    edge m(c)        → c      │
 └────────────┬────────────────┘
              │
              ▼
 ┌─────────────────────────────┐
 │ 4. RANK ASSIGN (longest-    │
 │    path on parent edges)    │
 │  - resolve cousin-marriage:  │
 │    keep shallower rank       │
 └────────────┬────────────────┘
              │
              ▼
 ┌─────────────────────────────┐
 │ 5. DAGRE LAYOUT             │
 │  rankdir TB, nodesep 80,     │
 │  ranksep 180, edgesep 24     │
 │  CUs are single nodes here   │
 └────────────┬────────────────┘
              │
              ▼
 ┌─────────────────────────────┐
 │ 6. EXPAND                   │
 │  split CU → two persons      │
 │  midNodes drop out (used     │
 │  only as routing anchors)    │
 └────────────┬────────────────┘
              │
              ▼
 ┌─────────────────────────────┐
 │ 7. EDGE BUILD               │
 │  couple edge: custom comp.   │
 │  parent edge: smoothstep via │
 │   midpoint coord             │
 │  cousin-skip: straight + tag │
 └────────────┬────────────────┘
              │
              ▼
       nodes[], edges[]
```

---

## 4. Function Signature

```ts
// lib/graph/layout-v2.ts
export type LayoutV2Options = {
  nodeWidth?: number;         // default 220
  nodeHeight?: number;        // default 240
  nodesep?: number;           // default 80
  ranksep?: number;           // default 180
  coupleGap?: number;         // default 24
  edgesep?: number;           // default 24
  /** Person ids whose positions must NOT be touched (manual pins). */
  pinned?: ReadonlySet<string>;
};

export type LayoutV2Result = {
  positions: Map<string, { x: number; y: number }>;
  /** Midpoint coordinates per child id — consumed by edge router. */
  midpoints: Map<string, { x: number; y: number }>;
  /** Couple-unit memberships, for the custom couple edge component. */
  couples: Array<{ leftId: string; rightId: string; status: SpouseStatus }>;
};

export function autoLayoutV2(
  people: PersonInput[],
  relationships: RelationshipInput[],
  options?: LayoutV2Options,
): LayoutV2Result;
```

`buildGraphElements` gets a new arg:

```ts
buildGraphElements(people, relationships, lang, { layout: 'v1' | 'v2' })
```

---

## 5. Pseudocode

### 5.1 Couple-compounding pre-pass

```
function compoundCouples(people, relationships):
  current = relationships.filter(r => r.type=='spouse' && r.status=='current')
  used = new Set()
  units = []
  for r in current sorted by order_index:
    if used.has(r.person_a_id) or used.has(r.person_b_id): continue
    units.push({ id: 'cu:'+r.id, members: [r.person_a_id, r.person_b_id], width: 2*W + coupleGap })
    used.add(r.person_a_id); used.add(r.person_b_id)
  // singletons (incl. divorced/widowed) become 1-person units of width W
  for p in people:
    if not used.has(p.id):
      units.push({ id: 'p:'+p.id, members:[p.id], width: W })
  return units
```

### 5.2 Parent-midpoint anchoring

```
function insertMidpoints(graph, people, unitOf):
  for c in people:
    if c.father_id and c.mother_id and unitOf(c.father_id) == unitOf(c.mother_id):
      // Parents are a compounded unit — single edge from the CU to child.
      graph.addEdge(unitOf(c.father_id), c.id)
    else if c.father_id and c.mother_id:
      // Parents are NOT a couple-unit (divorced, never-married, dead, etc.)
      m = 'mid:' + c.id
      graph.addNode(m, { width: 1, height: 1, virtual: true })
      graph.addEdge(unitOf(c.father_id), m)
      graph.addEdge(unitOf(c.mother_id), m)
      graph.addEdge(m, c.id)
    else:
      // single known parent
      p = c.father_id ?? c.mother_id
      if p: graph.addEdge(unitOf(p), c.id)
```

After Dagre runs, `midNode.x` is exactly `(parentA.x + parentB.x)/2` because Dagre balances two equal-weight incoming edges. We read that coord and use it as the elbow point for the child-drop edge — no post-pass needed.

### 5.3 Cousin-marriage resolution

```
function resolveRanks(graph):
  ranks = longestPathRanking(parentEdgesOnly(graph))
  // If a person is in a CU with someone at a different rank,
  // lift the deeper one to match the shallower partner.
  for cu in coupleUnits:
    rA = ranks[cu.members[0]]; rB = ranks[cu.members[1]]
    target = min(rA, rB)
    ranks[cu.members[0]] = ranks[cu.members[1]] = target
  // Tag the child-drop edges originating from a lifted parent as 'cousin-skip'
  // so the edge router uses straight + dashed style.
```

---

## 6. Test Fixtures (Alfred's 5 canonical shapes)

Location: `lib/graph/__fixtures__/layout-v2/`

| # | Name | File | Asserts |
|---|------|------|---------|
| 1 | Pure tree (no marriages) | `pure-tree.ts` — 1 root, 3 kids, 6 grandkids | All grandkids on same y; nodesep respected |
| 2 | Couple with kids | `couple-kids.ts` — H+W current, 3 kids | Couple x-adjacent; 3 kids centered under midpoint |
| 3 | Remarriage both sides | `remarriage.ts` — H ex-W1 (2 kids), H+W2 (1 kid); W1 + new partner (1 kid) | H,W2 compounded; H,W1 NOT compounded; kids of (H,W1) under midpoint between H and W1; no edge crossings |
| 4 | Cousin marriage | `cousin-marriage.ts` — A & B siblings (gen 1), A's child marries B's child (gen 2) | Both gen-2 cousins on same rank; couple edge between them; child of couple sits on gen 3 |
| 5 | Adopted child | `adopted.ts` — couple C+D, biological child X (parents E+F), adoption relationship adopted_by(X, C) and adopted_by(X, D) | X positioned under C+D midpoint; biological parent edges to E+F rendered with adopted-style (dashed) |

Each fixture exports `{ people, relationships, expected: { ranks, approxX } }`. Test asserts:
- Every person has `pos` defined.
- Ranks match expected.
- For every couple: `|posA.y - posB.y| < 1` and `|posA.x - posB.x| ≈ W + coupleGap`.
- For every two-parent child: `|child.x - midpoint(parents).x| < nodesep/2`.
- Zero parent-edge / spouse-edge crossings (geometric check).

---

## 7. Feature Flag Wiring

1. `app/tree/page.tsx` (server component) reads `searchParams.layout`.
2. Passes `layout: searchParams.layout === 'v2' ? 'v2' : 'v1'` into the client tree component.
3. Client passes it to `buildGraphElements(people, relationships, lang, { layout })`.
4. `buildGraphElements` branches:
   - `v1` → existing code path (unchanged, default).
   - `v2` → calls `autoLayoutV2`, ignores `pos_x/pos_y` for layout but still respects them as "pinned" if `pinned` set is supplied.
5. UI toggle: a small `Layout v2 (beta)` switch in the tree header writes to URL via `router.replace`. Persists only via URL, never to DB, until graduated.

Graduation criteria: all 5 fixtures pass + 1 week of internal use + QA sign-off → flip default, keep `?layout=v1` as escape hatch for 30 days, then remove v1.

---

## 8. Persistence Rule

| Scenario | Write to `pos_x/pos_y`? |
|---|---|
| First render, all positions null | **Yes**, silently. Tree has never been arranged. |
| User drags a node | Yes, that node only (existing behavior). |
| User clicks "Auto Layout" button, no manual positions exist | Yes, silently. |
| User clicks "Auto Layout" button, ≥1 manual position exists | **Confirm modal**: "Re-arrange the tree? Your manual positions will be replaced." Cancel = no-op. Confirm = overwrite all. |
| `?layout=v2` URL param alone (no button click) | **No**. Render in v2 layout but DO NOT persist. v2 is preview-only until user opts in. |
| Adding a single person (incremental) | Write the new person's computed position only. Do not touch others. |

This protects users who have hand-arranged their tree from a one-click wipeout while still letting v2 be tried risk-free via URL.

---

## 9. Edge Routing

- **Couple edge (current):** custom React Flow edge component `CoupleEdge`. Renders a single solid horizontal segment between the two right/left handles. Owns its own status color.
- **Couple edge (divorced/widowed):** same component, dashed/dotted styles (move existing styles into the component).
- **Parent → child (two parents):** `smoothstep` from each parent's bottom handle to the virtual midpoint coord, then a single vertical drop from midpoint to child's top handle. Implemented as one custom `FamilyDropEdge` component that draws the tee, OR two smoothstep edges meeting at midpoint (simpler; pick this for v2.0, upgrade to custom component in v2.1 if visual cleanup needed).
- **Parent → child (one parent):** plain `smoothstep`.
- **Cousin-skip spouse edge:** `straight`, dashed, tagged `cousin-skip` for styling.

Reject `orthogonal` global: React Flow's orthogonal routing doesn't share lanes between sibling edges; we'd get parallel duplicated segments. The midpoint trick achieves the visual without the cost.

---

## 10. Algorithm Choice: Dagre + Pre-pass (not ELK)

**Recommendation: extend Dagre with a couple-compounding pre-pass.**

| Criterion | Dagre + pre-pass | ELK (elkjs) | Custom Sugiyama |
|---|---|---|---|
| Bundle size | 0 KB added | +~200 KB | 0 KB |
| API | sync | async (worker) | sync |
| Already installed | Yes | No | No |
| Handles our 5 fixtures | Yes (with pre-pass) | Yes | Yes |
| Maintenance | Low | Medium | High |
| Time to ship | ~2 days | ~5 days | ~10 days |

Dagre's only real weakness here is that it doesn't natively understand "two nodes must be siblings on the same rank with a fixed gap." We solve that with the couple-compounding pre-pass (treat a couple as one wide node during Dagre, then split). That's a well-known pattern and avoids importing a second graph engine.

---

## 11. Incremental Layout Heuristic

```
On person added:
  if newPerson has known parents AND all siblings already laid out:
     // Local: place to the right of last sibling, same rank, write only this node
     local_place(newPerson)
  else if newPerson is a new spouse of an existing node:
     // Local: place adjacent to partner, same rank, shift right-side subtree by coupleGap
     local_couple_insert()
  else:
     // Topology changed (new root, new ancestor, multi-parent merge): full re-layout
     autoLayoutV2(all)
```

Local placement never triggers the confirm modal — it touches only the new node's coords.

---

## 12. Open Questions for Alfred

1. **Couple ordering inside a unit** — gender-based (M left, F right) or order_index from the relationship row? Default proposal: **order_index**, fall back to M-left for hetero couples when order_index ties.
2. **Adopted vs biological parents in fixture #5** — should the layout treat `adopted_by` as a parent edge for ranking purposes, or only biological `father_id/mother_id`? Proposal: **both count for ranking; biological draws solid, adopted draws dashed.**
3. **Show ex-partners at all?** Some family trees hide divorced spouses unless they share a child. Proposal: **always show if they share ≥1 child with the user; hide otherwise behind a "Show ex-partners" toggle.** (Out of scope for v2 layout itself, but affects which `people` we feed in.)
4. **Pinned nodes** — once we land manual-drag persistence, do we honor pins during Auto Layout (constrain Dagre) or wipe them with the confirm modal? Proposal: **wipe with confirm.** Constrained Dagre is hard; the confirm modal already covers the safety case.
5. **Multi-marriage ordering on the rank** — for H with W1 (ex) and W2 (current), do we place W1—H—W2 or H—W2 …  W1 elsewhere? Proposal: **W1—H—W2 left-to-right by marriage date** so children of each marriage drop cleanly under their pair.
6. **RTL handling** — Arabic users: do we mirror x-axis (rankdir RL)? Proposal: **yes when `lang === 'ar'`, set Dagre `rankdir: 'TB'` always but reverse couple member order so reading direction matches.**

---
