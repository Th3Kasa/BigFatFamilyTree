---
description: Vet and approve a new tool. tech-curator researches it, Alfred approves or rejects. Nothing enters the system without this process. Usage: /approve-plugin [tool name]
---

Deploy tech-curator (`subagent_type: "tech-curator"`) to research: $ARGUMENTS

"Produce a complete Plugin Research Report for: $ARGUMENTS
Include trust signals, security assessment, functionality assessment, and your recommendation.
Do NOT install anything — research only."

Alfred then reviews the report, applies approval criteria, records the decision in `.claude/shared/plugin-registry.md`, and presents the verdict to the user with next steps.
