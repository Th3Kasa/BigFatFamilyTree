# Agent Roster — Official Team Registry

Maintained by Alfred. This is the source of truth for team composition, agent status, and performance standing. Alfred reviews this after every `/review-team` run.

---

## Lifecycle Statuses

| Status | Meaning |
|--------|---------|
| 🟢 **Active** | Performing well, fully integrated |
| 🟡 **Trial** | New agent, under evaluation (first 5 uses) |
| 🔴 **Probation** | 3+ quality gate failures — under watch, prompt being fixed |
| ⚫ **Retired** | Moved to `.claude/agents/retired/` — archived, not deleted |

---

## Current Roster

| Agent | Role | Status | Uses | Failures | Last Used | Notes |
|-------|------|--------|------|----------|-----------|-------|
| `business-analyst` | 📋 Requirements & Scope | 🟢 Active | 0 | 0 | — | — |
| `saas-architect` | 🏗️ System Design | 🟢 Active | 0 | 0 | — | — |
| `ai-automation` | 🤖 LLM Pipelines | 🟢 Active | 0 | 0 | — | — |
| `web-builder` | 🌐 Full-Stack | 🟢 Active | 0 | 0 | — | — |
| `ui-craft` | 🎨 Design Systems | 🟢 Active | 0 | 0 | — | — |
| `copywriter` | ✍️ Copy | 🟢 Active | 0 | 0 | — | — |
| `seo-growth` | 📈 SEO & Analytics | 🟢 Active | 0 | 0 | — | — |
| `integrations` | 🔌 CRMs & APIs | 🟢 Active | 0 | 0 | — | — |
| `security-guard` | 🔒 OWASP & Auth | 🟢 Active | 0 | 0 | — | — |
| `qa-guard` | ✅ Testing & Sign-off | 🟢 Active | 0 | 0 | — | — |
| `devops-deploy` | 🚀 Deployment | 🟢 Active | 0 | 0 | — | — |
| `tech-curator` | 🔧 Tool Vetting | 🟢 Active | 0 | 0 | — | — |

---

## Roster Change Log

| Date | Change | Agent | Reason | Approved by |
|------|--------|-------|--------|-------------|
| 2025-05-22 | Formed | All 12 | Initial team | Alfred |

---

## Pending Proposals

_No proposals currently pending._

---

## Retired Agents

| Agent | Retired | Reason | Archive |
|-------|---------|--------|---------|
| _None yet_ | — | — | — |

---

## Evolution Triggers

Alfred flags an agent for review when:
- **3+ quality gate failures** in last 10 uses → Probation → prompt fix
- **0 uses in last 20 tasks** → Retirement review (may be replaced or merged)
- **User flags** an agent as underperforming → immediate review

Alfred proposes a **new agent** when:
- A task type recurs 3+ times that no current agent handles well
- A skill gap is identified during a task that caused rework or failure
- The user explicitly requests a new specialization
