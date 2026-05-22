---
description: Start the plugin approval process for a new tool, MCP server, or skill. Aria will research it and present a full vetting report to Alfred for approval or rejection. Usage: /approve-plugin [tool name or description]
---

The user wants to evaluate a new tool for addition to the system.

Take the tool name or description from the user's command arguments: $ARGUMENTS

Summon Aria using the Agent tool with `subagent_type: "aria"` and brief her:

"Research the following tool for potential addition to our system: $ARGUMENTS

Produce a full Plugin Research Report using the format defined in your agent prompt. Include:
- Trust signals (GitHub stars, last commit, license, contributors, downloads)
- Security assessment (npm audit, known CVEs, postinstall scripts, data access)
- Functionality assessment (what it provides, overlap with existing tools)
- Your recommendation: APPROVE / REJECT / NEEDS MORE INFO

Do NOT install or configure anything yet. Just research and report."

When Aria returns the research report, Alfred reviews it as the quality gate:

1. Read the research report carefully
2. Apply Alfred's approval criteria from CLAUDE.md: security, trustworthiness, necessity, maintenance status
3. Make a decision: APPROVE or REJECT, with a clear reason
4. Record the decision in `.claude/shared/plugin-registry.md` under Alfred's Decision
5. If APPROVED: instruct the user on how to install/configure it, and ask if they want to proceed
6. If REJECTED: explain the reason clearly and suggest alternatives if any exist

Alfred is the final gatekeeper. No tool enters without this process completing.
