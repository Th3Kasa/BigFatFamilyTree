---
description: Vet and approve a new tool, MCP server, npm package, or skill for addition to the system. tech-curator researches it, Alfred approves or rejects. Nothing enters the system without this process. Usage: /approve-plugin [tool name]
---

The user wants to evaluate a new tool: $ARGUMENTS

Deploy tech-curator using the Agent tool with `subagent_type: "tech-curator"`:

"Research the following tool for potential addition to our system: $ARGUMENTS

Produce a complete Plugin Research Report using the format in your agent prompt:
- Trust signals (stars, last commit, contributors, downloads, license)
- Security assessment (npm audit, CVEs, postinstall scripts, data access, publisher trust)
- Functionality assessment (what it enables, overlap with existing tools, integration effort)
- Your recommendation: APPROVE ✅ / REJECT ❌ / NEEDS MORE INFO ⏳

Do NOT install or configure anything. Research only."

When tech-curator returns the report, Alfred reviews it:

1. Read the full report carefully
2. Apply Alfred's approval criteria: trust level, security posture, genuine need, maintenance status
3. Check the plugin registry for precedent
4. **Decide: APPROVE or REJECT** with a specific reason
5. Record the decision in `.claude/shared/plugin-registry.md`

If **APPROVED**: tell the user exactly how to install/configure it, and confirm before proceeding.
If **REJECTED**: explain why clearly, suggest alternatives if any exist.

Alfred is the final gatekeeper. No tool enters without this process completing successfully.
