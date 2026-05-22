---
description: Display Alfred's full team roster with roles, specialties, assigned skills, and active integrations.
---

Display the team roster. Read CLAUDE.md for current information.

Output exactly this:

---

# Alfred's Team

**You talk to Alfred. Alfred runs the team.**

```
Me  → Alfred
│
├── 📋 business-analyst   — requirements & scope
├── 🏗️  saas-architect     — system design & tie-breaker
├── 🤖 ai-automation      — LLM pipelines & automations
├── 🌐 web-builder        — full-stack implementation
├── 🎨 ui-craft           — design systems & components
├── ✍️  copywriter         — copy that converts
├── 📈 seo-growth         — SEO, analytics, CWV
├── 🔌 integrations       — CRMs, APIs, webhooks
├── 🔒 security-guard     — OWASP & auth review
├── ✅ qa-guard           — testing & sign-off
├── 🚀 devops-deploy      — deployment & infra
└── 🔧 tech-curator       — tool vetting & maintenance
```

## Skills & Plugins (Auto-assigned — You Never Need to Call These Manually)

| Skill / Plugin | Agent |
|----------------|-------|
| `claude-api` | 🤖 ai-automation |
| `code-review` | 🔒 security-guard + ✅ qa-guard |
| `security-review` | 🔒 security-guard |
| `verify` | ✅ qa-guard |
| `run` | 🚀 devops-deploy |
| `review` | 🔒 security-guard + ✅ qa-guard |
| `init` | 📋 business-analyst |
| Supabase MCP | 🌐 web-builder + 🚀 devops-deploy |
| Vercel MCP | 🚀 devops-deploy |
| GitHub MCP | 🚀 devops-deploy + Alfred |
| Google Drive MCP | 📋 business-analyst + 🔌 integrations |

## Commands
`/alfred` — full orchestration mode · `/team` — this roster · `/maintain` — system audit · `/approve-plugin [name]` — tool vetting

---

Then check `.claude/shared/lessons.md` — if it has entries, show the 3 most recent under **Recent Lessons**.
