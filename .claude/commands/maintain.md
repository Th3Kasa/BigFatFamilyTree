---
description: Trigger tech-curator's full system health audit — dependencies, plugins, agent configs, permissions, and security advisories.
---

Deploy tech-curator (`subagent_type: "tech-curator"`) with this brief:

"Run a full system health audit:
1. `npm audit` — report high/critical vulnerabilities
2. `npm outdated` — flag packages > 2 major versions behind
3. `npx tsc --noEmit` — report errors
4. Read all `.claude/agents/*.md` — check for contradictions with CLAUDE.md, unincorporated lessons
5. Read `.claude/shared/plugin-registry.md` — flag stale tools
6. Read `.claude/settings*.json` — flag overly broad permissions
Update the Last Audited date in the plugin registry."

Alfred presents findings organized by severity with clear next steps.
