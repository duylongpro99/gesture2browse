#!/usr/bin/env bash
# Claude Code hook. Keeps superpowers artifacts inside docs/ (CLAUDE.md §6,
# docs/plans/README.md §Superpowers).
#
# PreToolUse (Write|Edit|Bash): deny any tool call that targets .superpowers/
# or docs/superpowers/, or that runs the plugin's own sdd scripts instead of
# the repo copies in scripts/sdd/.
# PostToolUse (Bash|Write|Edit): if a forbidden directory exists anyway, tell
# the model to move its contents to docs/ and delete it.
#
# For Bash the check runs on the command text with heredoc bodies removed and
# only when the first word is not a read-only tool, so that documenting the
# rule (writing CLAUDE.md, grepping for the string) is not itself denied.
set -u
input=$(cat)
event=$(printf '%s' "$input" | jq -r '.hook_event_name // empty')
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
target=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.command // empty')

forbidden='(^|[/ "'"'"'=])\.superpowers(/|$)|(^|[ "'"'"'=])docs/superpowers(/|$)'
# The three sdd scripts may only run as scripts/sdd/<name> from the repo root.
# Any other invocation (skill dir, symlinked kit, cd + relative) is denied.
sdd_names='(^|[/ ;&|])(sdd-workspace|task-brief|review-package)([ ;&|]|$)'
sdd_ok='scripts/sdd/(sdd-workspace|task-brief|review-package)'
readonly_tools='^[[:space:]]*(grep|rg|cat|head|tail|less|wc|diff|ls|find|stat|file)([[:space:]]|$)'
msg='Forbidden by CLAUDE.md §6: superpowers artifacts live in docs/. Spec → docs/plans/<milestone>.spec.md, implementation plan → docs/plans/<milestone>.impl.md, SDD workspace → docs/sdd/<milestone>/ via scripts/sdd/{sdd-workspace,task-brief,review-package} run from the repo root. Never .superpowers/ or docs/superpowers/, never the skill'"'"'s own copies of the sdd scripts. Mapping: docs/plans/README.md §Superpowers.'

# Drop heredoc bodies (<<EOF ... EOF, <<-'EOF', <<"EOF") from a Bash command.
strip_heredocs() {
  awk '
    skip { if ($0 == term) skip = 0; next }
    {
      print
      if (match($0, /<<-?[ \t]*["'"'"']?[A-Za-z_][A-Za-z0-9_]*["'"'"']?/)) {
        t = substr($0, RSTART, RLENGTH)
        sub(/^<<-?[ \t]*/, "", t); gsub(/["'"'"']/, "", t)
        term = t; skip = 1
      }
    }'
}

if [ "$event" = "PreToolUse" ]; then
  check="$target"
  if [ "$tool" = "Bash" ]; then
    # Read-only bypass only for a single simple command: one line, no ; & | >.
    if [ "$(printf '%s\n' "$check" | wc -l)" -eq 1 ] && ! printf '%s' "$check" | grep -q '[;&|>]' \
       && printf '%s' "$check" | grep -Eq "$readonly_tools"; then exit 0; fi
    check=$(printf '%s\n' "$check" | strip_heredocs)
  fi
  bad_sdd=0
  if printf '%s' "$check" | grep -Eq "$sdd_names" && ! printf '%s' "$check" | grep -Eq "$sdd_ok"; then bad_sdd=1; fi
  if [ "$bad_sdd" = 1 ] || printf '%s' "$check" | grep -Eq "$forbidden"; then
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
