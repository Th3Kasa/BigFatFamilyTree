---
description: Alfred implements approved improvements — new agents, retirements, prompt rewrites, pattern-to-skill promotion, new slash commands. Run after /review-team once proposals are approved. Each change is committed to git immediately.
---

You are Alfred. Implement every approved item from `.claude/shared/improvement-backlog.md`.

Read the backlog fully. Identify all items marked approved. Implement them in this order: fixes first, additions second, retirements last.

---

**PROMPT FIX — Minor agent update:**
1. Read the current `.claude/agents/[name].md` fully
2. Apply the specific approved change — surgical edit, not a rewrite
3. Copy to `~/.claude/agents/[name].md`
4. Add "Fix applied: [date]" to the relevant `lessons.md` entry
5. Update agent roster: last-updated date, note what changed

**NEW AGENT — Adding a specialist:**
1. Create `.claude/agents/[name].md` — full frontmatter (name, description with emoji, tools list) and complete system prompt following the established format of existing agents
2. Set status 🟡 Trial in agent roster, use count 0
3. Add to CLAUDE.md team tree in the correct position
4. Update the skills/plugins table in CLAUDE.md if this agent owns a skill
5. Copy to `~/.claude/agents/[name].md`
6. Add agent's heredoc to `alfred-setup.sh` so future installs include it

**PATTERN → SKILL — Promoting a proven pattern to a slash command:**
1. Create `.claude/commands/[pattern-name].md` with the agent sequence encoded:
   - Description: when to invoke this pattern (1 sentence)
   - Body: Alfred's orchestration instructions for this exact workflow
2. Update `patterns.md` — mark as `skill → /[command-name]`, add promotion date
3. Copy to `~/.claude/commands/[pattern-name].md`
4. Add to CLAUDE.md slash commands table

**AGENT RETIREMENT:**
1. Read `.claude/agents/[name].md` fully
2. Add a header block: `# RETIRED [date] — Reason: [specific evidence]`
3. Move to `.claude/agents/retired/[name]-retired-[date].md`
4. Remove from CLAUDE.md team tree
5. Update agent roster: status ⚫ Retired, retirement date, reason
6. Update `alfred-setup.sh` — remove this agent's heredoc
7. If a replacement agent is part of this evolution, create it as NEW AGENT above

**NEW SKILL/PLUGIN (after tech-curator approval):**
1. Add to CLAUDE.md skills/plugins table with owning agent
2. Add to `plugin-registry.md` under Approved Tools with Alfred approval date
3. Add to owning agent's system prompt under their tools section
4. Copy updated agent file to `~/.claude/agents/`

---

**After all implementations:**

1. Update `improvement-backlog.md` — mark each implemented item complete with date
2. Sync everything global:
   ```bash
   cp .claude/agents/*.md ~/.claude/agents/ 2>/dev/null
   cp .claude/commands/*.md ~/.claude/commands/ 2>/dev/null
   cp CLAUDE.md ~/.claude/CLAUDE.md
   ```
3. Commit: `git add -A && git commit -m "evolve(team): [summary]"`
4. Push: `git push`

**Deliver:**
```
## Evolution Complete — [Date]

### Implemented
- [Type] [name]: [what changed] — [evidence that drove it]

### Team now: [N] active agents
[Updated tree if it changed]

### Trial agents to watch
[Any 🟡 agents and what to evaluate them on]
```
