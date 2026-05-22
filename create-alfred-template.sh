#!/usr/bin/env bash
# =============================================================================
# Creates a clean alfred-starter directory ready to push to GitHub as a
# template repository. Run once from any location.
#
# Usage:
#   bash create-alfred-template.sh [target-dir]
#
# Then push to GitHub and mark the repo as a Template Repository in Settings.
# After that: every new GitHub repo can use alfred-starter as its template,
# and Alfred + the full team are there from commit 1.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$HOME/alfred-starter}"

echo ""
echo "  Creating alfred-starter template at: $TARGET"
echo ""

rm -rf "$TARGET"
mkdir -p "$TARGET/.claude/agents" "$TARGET/.claude/commands" "$TARGET/.claude/scripts" "$TARGET/.claude/shared"

cp "$SCRIPT_DIR/.claude/agents/"*.md      "$TARGET/.claude/agents/"
cp "$SCRIPT_DIR/.claude/commands/"*.md    "$TARGET/.claude/commands/"
cp "$SCRIPT_DIR/.claude/scripts/"*.sh     "$TARGET/.claude/scripts/"
cp "$SCRIPT_DIR/.claude/shared/"*.md      "$TARGET/.claude/shared/"
cp "$SCRIPT_DIR/.claude/settings.json"    "$TARGET/.claude/"
cp "$SCRIPT_DIR/CLAUDE.md"               "$TARGET/"
cp "$SCRIPT_DIR/alfred-setup.sh"         "$TARGET/"

cat > "$TARGET/README.md" << 'EOF'
# alfred-starter

GitHub Template Repository — every project created from this gets Alfred and the full 12-agent AI team automatically.

## The Team

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

## How It Works

1. Create a new GitHub repo using this as the template
2. Open in Claude Code on the web
3. Session starts → Alfred installs globally → just start talking

## Adding Alfred to an Existing Project

```bash
bash alfred-setup.sh
```
EOF

echo "  ✅ Template directory ready."
echo ""
echo "  Next steps:"
echo ""
echo "  1. Create a new repo on GitHub called 'alfred-starter' (empty, public or private)"
echo ""
echo "  2. Push the template:"
echo "       cd $TARGET"
echo "       git init && git add . && git commit -m 'Install Alfred multi-agent team'"
echo "       git remote add origin https://github.com/YOUR_USERNAME/alfred-starter.git"
echo "       git push -u origin main"
echo ""
echo "  3. On GitHub: repo Settings → scroll down → check 'Template repository' → Save"
echo ""
echo "  Done. From now on:"
echo "  GitHub → New repository → Repository template → alfred-starter → Create"
echo "  Alfred is there from commit 1."
echo ""
