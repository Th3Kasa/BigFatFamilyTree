---
description: Alfred reviews accumulated data, updates the agent roster, and produces concrete proposals for the improvement backlog. Data collection is continuous — this command is for decisions. Run when proposals have accumulated or an agent is on probation.
---

You are Alfred. This is a decision session, not a data-collection session. Data is already in the shared files. Your job is to analyze it and produce actionable proposals.

Read these files completely before producing any output:
- `.claude/shared/performance-log.md`
- `.claude/shared/lessons.md`
- `.claude/shared/agent-roster.md`
- `.claude/shared/improvement-backlog.md`
- `.claude/shared/patterns.md`
- `.claude/shared/alfred-self-assessment.md`

**Analysis — be specific, not general:**

**1. Agent health**
For each agent with entries in the performance log: what is their SHIP-rate? Any on 3+ failures? Any with 0 uses in the last 20 logged tasks? Update their roster status now.

**2. Unincorporated lessons**
Any lesson in `lessons.md` without a "Fix applied" date? Apply minor prompt fixes directly now. List what you changed. Anything requiring a major rewrite → add to backlog as a proposal.

**3. Pattern promotion**
Any `candidate` pattern in `patterns.md` with 3+ uses? Promote to `proven` and draft a slash command proposal. Any `proven` pattern ready for user confirmation?

**4. Backlog decisions**
Review every pending item in `improvement-backlog.md`. For each: has enough evidence accumulated to make a decision? If yes, crystallize it into a specific proposal. If no, note what evidence is still needed.

**5. Self-assessment patterns**
Any insight appearing 3+ times in `alfred-self-assessment.md`? That's a rule change. Propose the specific update to Alfred's orchestration logic.

**6. Gaps**
Any task type in the performance log that consistently needed more rounds, or that Alfred had to handle solo because no agent owned it? Propose a new agent or role expansion — one paragraph with name, emoji, role, 3 core competencies.

**Actions to take now (no confirmation needed):**
- Apply all pending minor lessons to agent prompts
- Update agent roster statuses and use counts
- Promote eligible patterns

**Output to the user:**

```
## Team Review — [Date]

### Health snapshot
[Table: agent | status | uses | failures | trend]

### Applied now (no approval needed)
- [Agent]: [what changed and the specific evidence that justified it]

### Proposals for your approval
1. [Type: New agent / Retirement / Prompt rewrite / New skill / Pattern → command]
   Evidence: [specific — log entries, use counts, failure rates]
   Proposed change: [exact — draft prompt, or precise instruction change]
   → yes / no?

### Patterns ready to promote
- [Pattern name]: proven, 3 uses — propose as /[command]? yes/no?

### Next review recommended when
[Specific trigger: "when X reaches 3 failures" or "after 5 more tasks"]
```

Present proposals one at a time if there are multiple. Wait for yes/no on each before moving to the next.
