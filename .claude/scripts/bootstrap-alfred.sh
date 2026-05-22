#!/usr/bin/env bash
# Installs Alfred and the full agent team into ~/.claude/ for this session.
# Runs automatically via SessionStart hook. Safe to run manually anytime.

CLAUDE_DIR=".claude"
GLOBAL_DIR="$HOME/.claude"

mkdir -p "$GLOBAL_DIR/agents" "$GLOBAL_DIR/commands" "$GLOBAL_DIR/shared"

cp "$CLAUDE_DIR/agents/"*.md "$GLOBAL_DIR/agents/" 2>/dev/null
cp "$CLAUDE_DIR/commands/"*.md "$GLOBAL_DIR/commands/" 2>/dev/null

for f in "$CLAUDE_DIR/shared/"*.md; do
  fname="$(basename "$f")"
  [ ! -f "$GLOBAL_DIR/shared/$fname" ] && cp "$f" "$GLOBAL_DIR/shared/$fname"
done

cp "CLAUDE.md" "$GLOBAL_DIR/CLAUDE.md" 2>/dev/null

echo "[Alfred] Team installed globally for this session. 12 agents ready."
