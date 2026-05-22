# Plugin & Tool Registry

Maintained by Aria. All additions require Alfred's explicit approval. This is the authoritative record of every tool in the system.

---

## Approved Tools

### MCP Servers

| Tool | Purpose | Stars | Last Audited | Alfred Approval |
|------|---------|-------|--------------|-----------------|
| Supabase MCP | Database, migrations, RLS, edge functions, logs | Official Supabase | 2025-05-22 | Pre-approved (official) |
| Vercel MCP | Deployments, build logs, runtime logs, domains | Official Vercel | 2025-05-22 | Pre-approved (official) |
| GitHub MCP | Repository management, PRs, issues, code search | Official GitHub/Anthropic | 2025-05-22 | Pre-approved (official) |
| Google Drive MCP | File storage and document access | Official Google | 2025-05-22 | Pre-approved (official) |

### Claude Code Skills

| Skill | Purpose | Last Audited | Alfred Approval |
|-------|---------|--------------|-----------------|
| `claude-api` | Anthropic SDK integrations, Claude API usage | 2025-05-22 | Pre-approved (official) |
| `code-review` | Automated code review | 2025-05-22 | Pre-approved (official) |
| `security-review` | Security audit on pending changes | 2025-05-22 | Pre-approved (official) |
| `verify` | Browser-test features after implementation | 2025-05-22 | Pre-approved (official) |
| `run` | Start app and confirm behavior | 2025-05-22 | Pre-approved (official) |
| `review` | PR review | 2025-05-22 | Pre-approved (official) |
| `init` | Initialize project documentation | 2025-05-22 | Pre-approved (official) |

---

## Pending Review

_No tools pending review._

---

## Rejected Tools

| Tool | Reason | Date | Rejected by |
|------|--------|------|-------------|
| _None yet_ | — | — | — |

---

## Approval Criteria (Alfred's Gate)

A tool is approved when ALL of these are true:
- [ ] GitHub stars: 500+ (1000+ preferred)
- [ ] Last commit: within 60 days
- [ ] License: MIT / Apache 2.0 / BSD (or justified exception)
- [ ] No known unpatched CVEs
- [ ] No suspicious postinstall scripts
- [ ] Serves a genuine need not covered by existing tools
- [ ] Aria has produced a full research report
- [ ] Alfred has reviewed and signed off

---

## Audit Log

| Date | Audited by | Scope | Findings |
|------|-----------|-------|---------|
| 2025-05-22 | Aria (initial) | Full system | Initial registry populated — all tools are official integrations |
