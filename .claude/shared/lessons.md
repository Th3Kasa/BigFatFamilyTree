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

### 2026-05-23 — Minor
**Agent:** qa-guard
**What happened:** `linkChild` was missing the same duplicate-parent guard that existed in `linkParentChild`. When the guard was added to `linkParentChild` in Task #3, `linkChild` (a symmetric function) was not updated. qa-guard caught it in Task #4.
**Root cause:** Alfred applied a point fix to one function without checking for symmetric functions with the same responsibility.
**Fix applied:** Guard added to `linkChild` in Task #4 commit.
**Prevention:** When fixing a guard/validation in a function, always search for symmetric counterpart functions (same signature, same responsibility, different entry point) and apply the same fix.
**Prompt update needed:** Yes — add to qa-guard audit scope: "Check symmetric server action pairs (linkChild/linkParentChild, deletePerson/deletePersonCanvas, createPerson/createPersonQuick) for missing guards or inconsistent validation patterns."

## Incorporated Lessons
_Lessons already incorporated into agent prompts are archived here._
