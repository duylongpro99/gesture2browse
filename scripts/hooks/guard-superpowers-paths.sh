#!/usr/bin/env bash
# Claude Code hook. Keeps superpowers artifacts inside docs/ (CLAUDE.md §6).
#
# PreToolUse (Write|Edit|Bash): deny any tool call that targets .superpowers/
# or docs/superpowers/, or that runs the plugin's own sdd scripts instead of
# the repo copies in scripts/sdd/.
# PostToolUse (Bash|Write|Edit): if a forbidden directory exists anyway, tell
# the model to move its contents to docs/ and delete it.
set -u
input=$(cat)
event=$(printf '%s' "$input" | jq -r '.hook_event_name // empty')
target=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.command // empty')

forbidden='(^|[/ "'"'"'=])\.superpowers(/|$)|docs/superpowers(/|$)|subagent-driven-development/scripts/(sdd-workspace|task-brief|review-package)'
msg='Forbidden by CLAUDE.md §6: superpowers artifacts live in docs/. Spec → docs/plans/<milestone>.spec.md, implementation plan → docs/plans/<milestone>.impl.md, SDD workspace → docs/sdd/<milestone>/ via scripts/sdd/{sdd-workspace,task-brief,review-package}. Never .superpowers/ or docs/superpowers/, never the plugin copies of the sdd scripts.'

if [ "$event" = "PreToolUse" ]; then
  if printf '%s' "$target" | grep -Eq "$forbidden"; then
    jq -n --arg r "$msg" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  fi
  exit 0
fi

if [ "$event" = "PostToolUse" ]; then
  root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
  if [ -e "$root/.superpowers" ] || [ -e "$root/docs/superpowers" ]; then
    jq -n --arg r "$msg A forbidden directory now exists at the repo root. Move anything useful into docs/ per the mapping and delete it." '{decision:"block",reason:$r}'
  fi
  exit 0
fi
exit 0
