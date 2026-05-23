# Performance Log

Alfred logs every significant task here. This is the raw data that powers team evolution. tech-curator and Alfred read this during `/review-team` to detect patterns and drive improvements.

---

## Log Format

```
### [Date] — Task #[N]
**Task:** [What the user asked for — one line]
**Agents used:** [list]
**Outcome:** ✅ Shipped / ⚠️ Rework needed / ❌ Failed
**Quality gate result:** SHIP / HOLD (and how many rounds)
**What worked:** [brief]
**What didn't:** [brief — be specific]
**Agent ratings this task:** [agent: ⭐⭐⭐⭐⭐ / notes]
**Improvement opportunity:** [specific prompt fix, new skill needed, or new agent idea]
```

---

## Active Log

### 2026-05-23 — Task #3 (QA loop — autonomous)
**Task:** Continuous QA loop on 2D canvas — fix bugs, improve UX, keep working
**Agents used:** Alfred (direct), qa-guard (audit pass)
**Outcome:** ✅ Shipped
**Quality gate result:** SHIP — multiple rounds, all fixes landed clean
**What worked:** qa-guard's 10-issue audit report was high signal: found the critical `return` vs `continue` bug in onEdgesDelete that would silently skip DB unlinking for entire edge batches, and the deleteConfirm-not-reset that could cause accidental person deletion. FamilyBranchEdge perf rewrite (useNodes → useInternalNode + useStore) eliminated O(edges × nodes) drag-frame re-renders.
**What didn't:** qa-guard Issue 2 (setTimeout race) was a false positive — the pendingQuickAddRef design already handles both orderings correctly.
**Agent ratings this task:** qa-guard ⭐⭐⭐⭐⭐ — 10 issues, 3 critical/high that were real and impactful; Alfred ⭐⭐⭐⭐⭐ — implemented all fixes without rework
**Improvement opportunity:** qa-guard's audit scope was well-calibrated. The inline quick-add via forwardRef + useImperativeHandle is a pattern worth capturing for future Inspector-like panels.

**Bugs fixed this session:**
- BUG-02: linkParentChild silent parent FK overwrite (pre-flight check)
- BUG-05: PersonPicker swallowed errors (toast catch block)
- BUG-06: InlineQuickAdd sibling with no parents (addSibling call)
- BUG-07: Dead placeholderId branch in picker
- BUG-10: Context menu off-screen (useLayoutEffect viewport clamping)
- BUG-13: `<button>` nested inside `<Link>` in placeholder PersonNode (invalid HTML)
- BUG-16: Node card "Add child"/"Add spouse" buttons opened full /person/new form; now open Inspector inline quick-add (forwardRef + useImperativeHandle)
- BUG-21: deleteKeyCode="Delete" allowed client-side node removal without server action
- Critical: onEdgesDelete `return` → `continue` (silently skipped DB unlinking)
- High: deleteConfirm not reset on person change (could trigger immediate delete)
- High: sibling addSibling fire-and-forget (orphan record on error)
- High: handleAddChild gender-binary logic dropped spouse when both unknown gender
- High: edge context menu had no viewport clamping
- Medium: removeCurrentEdgeRelationship null treated as success
- Medium: placeholder keyboard trap (Enter on delete button also fired navigation)
- Perf: FamilyBranchEdge eliminated useNodes() O(n×m) subscription per drag frame

---

### 2026-05-23 — Task #4 (QA loop — second audit pass)
**Task:** QA loop continued — fresh qa-guard audit sweep, all 10 issues resolved
**Agents used:** qa-guard (audit), Alfred (all fixes)
**Outcome:** ✅ Shipped
**Quality gate result:** SHIP — 1 round, all 10 issues addressed in a single commit
**What worked:** qa-guard found the critical `uniqueSlug` excludeId bug (slug corruption on every edit), which was a silent Supabase query-builder immutability mistake. Also found the linkChild missing guard (mirrors the linkParentChild guard added in Task #3 — should have been fixed in the same pass). PersonPicker boolean-return contract is a clean fix for the "close-on-failure" UX break.
**What didn't:** QA4-04 for `createPerson` is only partially fixed — we check the relErr but still redirect (person is already committed, can't undo). This is an architectural constraint of server actions + redirect, not a code bug. Noted as known limitation.
**Agent ratings this task:** qa-guard ⭐⭐⭐⭐⭐ — all 10 issues were real and actionable; Alfred ⭐⭐⭐⭐⭐ — implemented all fixes in one shot, zero rework, TypeScript clean
**Improvement opportunity:** The linkChild/linkParentChild symmetry gap (same guard needed in both, only added to one) suggests qa-guard should check symmetry between similar functions. Add this to audit scope.

---

### 2026-05-22 — Task #2
**Task:** Fix T-junction vertical bracket — drop should originate from the marriage line (mid-height of person cards) not from the bottom handle
**Agents used:** Alfred (direct — single targeted fix, 3 lines changed)
**Outcome:** ✅ Shipped
**Quality gate result:** SHIP — 1 round, no rework
**What worked:** Root cause was precise: left/right handles sit at NODE_HEIGHT/2; changing startY from NODE_HEIGHT to NODE_HEIGHT/2 fixed all three parent-combination cases in one edit
**What didn't:** Nothing failed
**Agent ratings this task:** Alfred solo ⭐⭐⭐⭐⭐ — direct fix, no delegation needed
**Improvement opportunity:** None — single-file surgical fix, correct pattern

---

### 2026-05-22 — Task #1
**Task:** Fix canvas connection dots — each person card should have visible handle dots at Left/Right/Top/Bottom; connections should route from the exact dot the user dragged, not a default position
**Agents used:** Explore (codebase survey), web-builder (implementation)
**Outcome:** ✅ Shipped
**Quality gate result:** SHIP — 1 round, no rework
**What worked:** Explore gave a thorough map of all canvas files before implementation; web-builder applied all 4 fixes surgically with zero new TypeScript errors
**What didn't:** Nothing failed — straightforward diagnosis and execution
**Agent ratings this task:** Explore ⭐⭐⭐⭐⭐ — complete file inventory on first pass; web-builder ⭐⭐⭐⭐⭐ — all 4 bugs fixed cleanly, no rework
**Improvement opportunity:** None identified — standard canvas bug pattern handled well

---

## Patterns (Updated by Alfred during /review-team)

_No patterns identified yet._

---

## Improvement Actions Taken

| Date | Action | Agent/Area | Result |
|------|--------|-----------|--------|
| _None yet_ | — | — | — |
