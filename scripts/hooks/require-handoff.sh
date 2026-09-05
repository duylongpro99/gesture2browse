#!/usr/bin/env bash
# Claude Code Stop hook: a driving-a-milestone worker may not end its turn
# without a handoff for its session.
#
# Enabled by .claude/scope.json (written by scripts/milestone/spawn, gitignored),
# like guard-scope.sh; a no-op everywhere else. When the file names a session N
# and docs/sdd/<M>/handoff.md is missing or says another session, the hook
# blocks the stop (exit 2) with the reason on stderr, which Claude Code feeds
# back to the worker as its next instruction. This is what turns a turn that
# was cut by a lost connection into "continue and hand off" once the network is
# back, instead of a pane sitting idle until the owner types something.
#
# At most STOP_MAX_BLOCKS (default 3) blocks per session, counted in
# .claude/stop-blocks (reset by spawn), so a worker that truly cannot write the
# handoff is not looped forever; the driver then sees RESULT=idle and asks the owner.
set -u
root=${CLAUDE_PROJECT_DIR:-}
[ -n "$root" ] || root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
root=${root%/}
scope="$root/.claude/scope.json"
[ -f "$scope" ] || exit 0
m=$(jq -r '.milestone // empty' "$scope"); n=$(jq -r '.session // empty' "$scope")
[ -n "$m" ] && [ -n "$n" ] || exit 0
handoff="$root/docs/sdd/$m/handoff.md"
if [ -f "$handoff" ] && [ "$(sed -n 's/^session:[[:space:]]*//p' "$handoff" | head -1)" = "$n" ]; then
  grep -Eq '^outcome:[[:space:]]*(CONTINUE|NEEDS-OWNER|DONE|BLOCKED)[[:space:]]*$' "$handoff" && exit 0
  why="docs/sdd/$m/handoff.md has no valid 'outcome:' line (CONTINUE | NEEDS-OWNER | DONE | BLOCKED)"
else
  why="docs/sdd/$m/handoff.md with 'session: $n' does not exist"
fi
counter="$root/.claude/stop-blocks"
count=$(cat "$counter" 2>/dev/null || echo 0); case "$count" in ''|*[!0-9]*) count=0 ;; esac
max=${STOP_MAX_BLOCKS:-3}
if [ "$count" -ge "$max" ]; then
  echo "require-handoff: $why; already blocked $count times, letting the turn end (the driver will ask the owner)" >&2
  exit 0
fi
echo $((count + 1)) > "$counter"
cat >&2 <<EOF
You are the driving-a-milestone worker for milestone $m, session $n, and you are about to stop, but $why.
If your previous turn was interrupted (connection lost), re-read docs/sdd/$m/session-$n-brief.md, check \`git status\` and the SDD ledger progress.md for what is already done, and continue from there.
Before you stop: commit your work (explicit paths, one task per commit), then write docs/sdd/$m/handoff.md in the exact format the brief gives, with \`session: $n\` and an \`outcome:\` line. If you are truly stuck, hand off \`outcome: BLOCKED\` with the reason in \`summary\`.
EOF
exit 2
