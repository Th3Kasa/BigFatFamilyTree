---
description: Trigger tech-curator's full system health audit. Checks dependencies, plugin health, agent configurations, permissions, and security advisories. All findings reported to Alfred.
---

Deploy tech-curator for a full system maintenance audit.

Use the Agent tool with `subagent_type: "tech-curator"` with this brief:

"Run a full system health audit on this project. In order:

1. **Dependency security**: run `npm audit` — report any high or critical vulnerabilities with CVE IDs and whether a fix is available
2. **Package currency**: run `npm outdated` — flag packages > 2 major versions behind
3. **TypeScript integrity**: run `npx tsc --noEmit` — report any errors
4. **Agent config review**: read all `.claude/agents/*.md` files — verify tools lists are minimal, check for contradictions with CLAUDE.md, identify any lessons from `.claude/shared/lessons.md` not yet incorporated
5. **Plugin registry review**: read `.claude/shared/plugin-registry.md` — flag tools last audited > 90 days ago, or with stale last commit dates
6. **Permission audit**: read `.claude/settings.json` and `.claude/settings.local.json` — flag overly broad or stale permissions

After auditing, update the Last Audited date in the plugin registry.

Report back to Alfred: findings by category, severity (critical/high/medium/low), recommended actions, and anything requiring Alfred's explicit approval before proceeding."

After tech-curator reports, Alfred presents to the user: organized by severity, with clear next steps and any decisions the user needs to make.
