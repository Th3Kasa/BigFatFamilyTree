# Team Lessons Learned

Mistakes and patterns logged here. tech-curator reviews and updates agent prompts when patterns emerge.

## Format
```
### [Date] — [Severity]
**Agent:** [Who]
**What happened:** [Description]
**Root cause:** [Why]
**Fix applied:** [What was corrected]
**Prevention:** [What stops this recurring]
**Prompt update needed:** [Yes/No]
```

## Active Lessons

### 2026-05-23 — Critical (QA7-04)
**Agent:** Alfred
**What happened:** QA5-03 added `aria-hidden="true"` to the outer backdrop div of `QuickAddDialog` to mark it as decorative. The `role="dialog"` element is a child of that div, so `aria-hidden` on the parent hid the entire dialog from the accessibility tree — a complete WCAG 2.1 SC 4.1.3 regression introduced by the fix itself.
**Root cause:** When adding `aria-hidden` to a container, the effect on descendants was not checked. `aria-hidden` on a parent suppresses all descendants unconditionally.
**Fix applied:** Removed `aria-hidden="true"` from the outer backdrop div — Task #7.
**Prevention:** Never set `aria-hidden="true"` on any element that contains or is an ancestor of a `role="dialog"`, `role="alertdialog"`, or any interactive landmark. If backdrop isolation is needed, use `inert` on sibling content outside the dialog.
**Prompt update needed:** Yes — add to qa-guard audit scope: "Flag any `aria-hidden` attribute on an element that contains a `role=dialog`, `role=alertdialog`, or interactive form controls."

### 2026-05-23 — Minor (QA6-02)
**Agent:** Alfred
**What happened:** `deleteRelationship` and `updateRelationshipStatus` only revalidated the calling person's profile, not the second party's. After removing a spouse link, person B's page served stale cached data showing person A as still married.
**Root cause:** Relationship mutations affect two people but only one path was revalidated. This is a systematic gap: any function that mutates a relationship row must revalidate both `person_a_id` and `person_b_id` profile paths.
**Fix applied:** Both functions now fetch the relationship row before mutation to get both IDs, then revalidate both profile paths — Task #6.
**Prevention:** When writing or reviewing any server action that touches the `relationships` table, always revalidate both parties' paths.
**Prompt update needed:** Yes — add to qa-guard audit scope: "Any mutation of the relationships table must revalidate both person_a_id and person_b_id profile paths."

### 2026-05-23 — Minor (QA5-06)
**Agent:** Alfred / qa-guard
**What happened:** `convertParentToSpouse` had `if (field) { unlink }` with no else guard — when `field` was null (no parent link existed), it silently skipped the unlink and still created a spouse relationship. This is a "conditional action without else guard" anti-pattern.
**Root cause:** The else branch was omitted on a conditional action block; the function continued executing regardless of whether the precondition was met.
**Fix applied:** Early return added: `if (!field) return { success: false, error: "No parent link found..." }` — QA5-06 in Task #5 commit.
**Prevention:** Any conditional action block (`if (x) { await doSomething() }`) must have an early return or explicit else. Silent no-ops in server actions are bugs.
**Prompt update needed:** Yes — added "conditional action blocks missing else/early-return guard" pattern to qa-guard audit scope. Fix applied 2026-05-23.

## Incorporated Lessons

### 2026-05-23 — Minor (Task #4)
**Agent:** qa-guard
**What happened:** `linkChild` was missing the same duplicate-parent guard that existed in `linkParentChild`. When the guard was added to `linkParentChild` in Task #3, `linkChild` (a symmetric function) was not updated. qa-guard caught it in Task #4.
**Root cause:** Alfred applied a point fix to one function without checking for symmetric functions with the same responsibility.
**Fix applied:** Guard added to `linkChild` in Task #4 commit.
**Prevention:** When fixing a guard/validation in a function, always search for symmetric counterpart functions (same signature, same responsibility, different entry point) and apply the same fix.
**Prompt update needed:** Yes — added symmetric function check to qa-guard audit scope. Fix applied 2026-05-23.
