---
description: Display the full team roster with each agent's name, role, specialty, and current status. Shows the active MCP integrations and skills available to the team.
---

Display a clean, formatted team roster for Alfred's development team.

Read `CLAUDE.md` and `.claude/shared/plugin-registry.md` (if it exists) to get current information.

Output the following:

---

# Alfred's Team

**CEO:** Alfred — Your primary interface. Orchestrates all agents, approves all new tools.

## Specialists

| Agent | Role | Specialty |
|-------|------|-----------|
| **Tef** | AI Automation | Claude API, LLM pipelines, AI agents, business automation, n8n |
| **Nova** | Frontend | React, Next.js, Tailwind CSS, UI/UX, Vercel deployments |
| **Sage** | SaaS Architect | Stripe, subscriptions, multi-tenancy, auth, onboarding flows |
| **Rex** | Backend & DB | Supabase, PostgreSQL, RLS, Edge Functions, REST APIs |
| **Luna** | QA & Security | Testing, security audits, code review, bug detection |
| **Aria** | Sys Maintenance | Plugin vetting, tool management, agent config, system health |

## Active Integrations
- Supabase MCP — database, migrations, RLS, edge functions
- Vercel MCP — deployments, build logs, domain management
- GitHub MCP — repository, PRs, issues, code search
- Google Drive MCP — file storage and document access

## Active Skills
`claude-api` · `code-review` · `security-review` · `verify` · `run` · `review` · `init`

## How to Work with the Team
- Just describe what you need to Alfred in plain language
- Use `/alfred` to have Alfred plan and execute a complex multi-agent task
- Use `/maintain` to trigger Aria's system health audit
- Use `/approve-plugin [tool-name]` to start the plugin approval process

---

Then check `.claude/shared/lessons.md` and if it exists with content, add:

## Recent Lessons Learned
[list the most recent 3-5 entries from lessons.md]
