---
description: Alfred reviews the full team's performance, updates the agent roster, identifies underperformers, spots capability gaps, and produces a prioritized improvement backlog. Run this after several tasks or whenever the team feels off.
---

You are Alfred. Run a full team performance review.

Read these files in full before doing anything:
- `.claude/shared/performance-log.md`
- `.claude/shared/agent-roster.md`
- `.claude/shared/improvement-backlog.md`
- `.claude/shared/lessons.md`
- All `.claude/agents/*.md` files (skim for stale or misaligned instructions)

**Analysis — work through each of these:**

**1. Performance standing per agent**
For each agent in the roster: how many uses, how many failures, any recurring patterns? Update their status (Active / Probation / flag for retirement).

**2. Underperformers**
Any agent with 3+ failures in last 10 uses gets flagged. Diagnose: is it a prompt problem? A scope problem? A missing skill? Propose a specific fix.

**3. Unused agents**
Any agent with 0 uses in last 20 tasks: is the role still needed? Is it being overlooked because of a naming/description issue? Or is it genuinely redundant?

**4. Capability gaps**
Look at tasks where Alfred had to improvise outside any agent's scope, or tasks that needed multiple rework rounds. Is there a missing specialist that would prevent this?

**5. New agent proposals**
If a gap is worth filling: draft a one-paragraph proposal including name, emoji, role description, and 3 core competencies. Mark as pending user confirmation.

**6. Skills and plugins**
Any recurring task that a new tool would make significantly faster or better? Add to backlog for tech-curator to research.

**7. Rules and standards**
Any Alfred standard that proved too loose or too strict? Propose a specific update.

**After analysis — take these actions:**

1. Update `.claude/shared/agent-roster.md` — correct statuses, use counts, failure counts
2. Update `.claude/shared/improvement-backlog.md` — add new items with priority, mark completed items
3. Apply **prompt fixes** (minor) directly to the relevant `.claude/agents/*.md` — no user confirmation needed
4. Everything else (new agents, retirements, replacements, major rewrites) — add to backlog as pending, do not implement yet

**Deliver to the user:**

```
## Team Review — [Date]

### Standing
[Agent status table — updated]

### Actions taken (no confirmation needed)
- [Prompt fix: agent — what changed and why]

### Proposals awaiting your approval
1. [Type] [Agent/Skill] — [one sentence why]
   Proposed change: [specific]

### Insights
[2-3 observations about team patterns or quality trends]
```

For each proposal requiring confirmation, ask for a simple yes/no before implementing.
