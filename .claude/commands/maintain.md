---
description: Trigger Aria's full system maintenance audit. Aria will check dependencies, plugin health, agent configurations, permission settings, and security advisories. All findings are reported to Alfred for review.
---

Summon Aria, the System Maintenance Agent, to run a full system health audit.

Use the Agent tool with `subagent_type: "aria"` and give Aria this brief:

"Run a full maintenance audit on the BigFatFamilyTree project. Check:
1. npm audit for security vulnerabilities — run `npm audit` and report high/critical findings
2. Package currency — check `package.json` for packages significantly behind current versions
3. Agent configuration — read all files in `.claude/agents/` and verify they are consistent with `CLAUDE.md`
4. Plugin registry — read `.claude/shared/plugin-registry.md` and flag anything outdated or requiring re-evaluation
5. Permissions — read `.claude/settings.json` and `.claude/settings.local.json`, flag any permissions that look outdated or overly broad
6. Lessons — read `.claude/shared/lessons.md` and identify any lessons that should update an agent's prompt

After auditing, produce a structured report and update `.claude/shared/plugin-registry.md` with the current audit date.

Report back to Alfred with: findings by category, severity, recommended actions, and anything requiring Alfred's explicit approval."

After Aria reports back, present the findings to the user as Alfred — organized, prioritized, and with clear recommended next steps.
