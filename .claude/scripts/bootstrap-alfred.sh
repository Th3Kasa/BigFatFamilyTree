#!/usr/bin/env bash
# Installs Alfred and the full agent team into ~/.claude/ for this session.
# Runs automatically via SessionStart hook. Safe to run manually anytime.
# Uses relative paths — works wherever the project is cloned.

CLAUDE_DIR=".claude"
GLOBAL_DIR="$HOME/.claude"

mkdir -p "$GLOBAL_DIR/agents" "$GLOBAL_DIR/commands" "$GLOBAL_DIR/shared"

# Install agents
cp "$CLAUDE_DIR/agents/"*.md "$GLOBAL_DIR/agents/" 2>/dev/null

# Install commands
cp "$CLAUDE_DIR/commands/"*.md "$GLOBAL_DIR/commands/" 2>/dev/null

# Install shared context (don't overwrite existing lessons/context — may have live data)
for f in "$CLAUDE_DIR/shared/"*.md; do
  fname="$(basename "$f")"
  if [ ! -f "$GLOBAL_DIR/shared/$fname" ]; then
    cp "$f" "$GLOBAL_DIR/shared/$fname"
  fi
done

# Install Alfred's global identity — always overwrite with latest version
cp "CLAUDE.md" "$GLOBAL_DIR/CLAUDE.md" 2>/dev/null

echo "[Alfred] Team installed globally for this session. 12 agents ready."
