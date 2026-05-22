# Skill Patterns — Proven Agent Playbooks

Alfred logs successful multi-agent combinations here. Patterns graduate from `candidate` → `proven` → `skill` (slash command) based on evidence, not opinions.

---

## Lifecycle

| Stage | Definition | Action |
|-------|-----------|--------|
| `candidate` | Used once, SHIP on first pass | Alfred notes it here |
| `proven` | Used 3+ times with consistent SHIP | Alfred drafts description + trigger |
| `skill` | User confirms → slash command created | `/command-name` created in `.claude/commands/` |

---

## Pattern Format

```
### [Pattern Name]
**Stage:** candidate / proven / skill → /command-name
**Task type:** [What user request triggers this]
**Agent sequence:** agent-1 → agent-2 → agent-3 (→ parallel: agent-4 + agent-5)
**Handoff notes:** [What each agent needs from the previous one]
**Uses:** [N] — [dates]
**Outcome:** SHIP first-pass / SHIP after N rounds
**Promoted to command:** [date] → /[name]
```

---

## Active Patterns

### Canvas Bug Fix
**Stage:** candidate
**Task type:** User reports a visual/interaction bug on the React Flow canvas (handles, edges, nodes)
**Agent sequence:** Explore → web-builder (or Alfred direct for single-file fixes)
**Handoff notes:** Explore maps all canvas files + reads key files; Alfred synthesizes root cause; web-builder gets exact file paths, line numbers, and specific fixes; for single-file surgical fixes Alfred handles directly
**Uses:** 2 — 2026-05-22, 2026-05-22
**Outcome:** SHIP first-pass (both uses)

---

## Promoted to Skills

| Pattern | Command | Created | Uses |
|---------|---------|---------|------|
| *None yet* | — | — | — |

---

## Notes on Pattern Detection

Alfred looks for patterns when:
- 2+ agents were used and the task shipped first-pass (efficiency worth replicating)
- A task type recurs — same category of request, similar agent sequence
- The orchestration felt obvious in retrospect (that clarity is worth capturing)

Alfred does **not** pattern tasks that:
- Required rework (those go to `lessons.md` instead)
- Were one-off or highly project-specific
- Took an unusual route due to constraints
