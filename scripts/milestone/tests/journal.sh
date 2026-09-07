#!/usr/bin/env bash
# Tests for scripts/milestone/journal (and the exit-check / status lines it feeds)
# against a fixture repo with a milestone worktree built in $TMPDIR. Run from anywhere:
#   scripts/milestone/tests/journal.sh
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/journal-test.XXXXXX"); [ "${KEEP_WORK:-}" = 1 ] && echo "work=$work" || trap 'rm -rf "$work"' EXIT
fail=0; n=0; out="$work/out"
check() { # predicate...: exit 0 = pass; on failure print the predicate and the last output
  n=$((n + 1)); if "$@"; then echo "ok $n - $*"; else echo "not ok $n - $*"; fail=1; [ -f "$out" ] && sed 's/^/    | /' "$out" | head -60; fi
}
has() { grep -Fq -- "$1" "$2"; }
lacks() { ! grep -Fq -- "$1" "$2"; }
count_is() { [ "$(grep -cF -- "$1" "$2" || true)" = "$3" ]; }

root="$work/proj"; mkdir -p "$root"; cd "$root"
git init -q -b master . 2>/dev/null || { git init -q .; git checkout -q -b master; }
git config user.email t@example.com; git config user.name t
mkdir -p docs/plans docs/journal docs/sdd scripts/milestone
cat > scripts/milestone/config <<'EOF'
MS_PANE_PREFIX=tj
MS_DEFAULT_BASE=master
MS_CHECK_ALLOW='^(test|\[|scripts/|false|true)'
EOF
cat > docs/05-roadmap.md <<'EOF'
# Roadmap

## 3. Phase 0

### 3.1 Milestone 0A — Scaffold and harness

| | |
|---|---|
| **Plan inputs** | docs 01–02 |
| **Exit** | scaffold file present; owner sees the banner |

## 8. Decision log

| Date | Decision | Input | Result |
|---|---|---|---|
| 2026-09-01 | Roadmap v0.1 | Owner | v0.1 |

## 9. Risks
EOF
cat > docs/STATUS.md <<'EOF'
# Status

| Milestone | Owner session | State (one sentence) | Plan | Updated |
|---|---|---|---|---|
| **0A** | drv-0A | in progress | `docs/plans/0A-scaffold.md` | 2026-09-07 |
EOF
git add -A; git commit -qm "init"
base_sha=$(git rev-parse --short HEAD)

# the milestone worktree on branch 0A, as claim leaves it
git worktree add -q -b 0A .worktrees/0A master
wt="$root/.worktrees/0A"; cd "$wt"
mkdir -p docs/sdd/0A docs/sdd/0A-scaffold docs/plans .claude
cat > docs/plans/0A-scaffold.md <<'EOF'
# 0A scaffold

## Exit checks

| # | Criterion (verbatim) | Kind | Check |
|---|---|---|---|
| E1 | scaffold file present | mechanical | `test -f scaffold.txt` |
| E2 | owner sees the banner | owner | - |

## Status

**Proposed decision(s) for roadmap §8 (owner logs; agent does not edit §8):**
> | 2026-09-07 | Harness is vitest | 0A | done |
EOF
cat > docs/sdd/0A-scaffold/progress.md <<'EOF'
| # | Task | Owner | Status | Notes |
|---|---|---|---|---|
| 1 | Scaffold files | core | done | |
| 2 | Banner | ui | pending | |
EOF
git add -A; git commit -qm "[docs] plan 0A" -m "[docs] plan: five questions and exit checks"
echo scaffold > scaffold.txt; git add scaffold.txt; git commit -qm "scaffold" -m "[core] task 1: Scaffold files"
mkdir -p docs/adr; echo "# ADR 1" > docs/adr/0001-banner-in-core.md; git add docs/adr; git commit -qm "adr" -m "[docs] task 2: ADR draft"
"$here/driver-state" 0A set base_branch master slug 0A-scaffold session 2 role execute >/dev/null
printf '{"milestone":"0A","role":"execute","session":2,"base":"%s"}\n' "$(git rev-parse HEAD)" > .claude/scope.json
cat > docs/sdd/0A/session-1-handoff.md <<'EOF'
outcome: DONE
phase: plan
session: 1
summary: spec, impl plan, exit checks written
next: execute task 1
EOF
cat > docs/sdd/0A/handoff.md <<'EOF'
outcome: CONTINUE
phase: execute
session: 2
summary: task 1 done; scaffold in place
exit-progress:
- scaffold file present → met
- owner sees the banner → not yet
next: task 2
EOF

# --- missing, then exit-check marks the owner row as having no steps -------------
"$here/journal" 0A --check > "$out" 2>&1 || true
check has "JOURNAL=missing" "$out"
"$here/exit-check" 0A --fast > "$out" 2>&1 || true
check has "E2  owner            OWNER (no steps in docs/journal/0A-scaffold.md)" "$out"
check has "E1  mechanical       PASS" "$out"
check test -f docs/sdd/0A/exit-check.last
check has "ran " docs/sdd/0A/exit-check.last

# --- first write ----------------------------------------------------------------
"$here/journal" 0A > "$out" 2>&1 || true
check has "JOURNAL: docs/journal/0A-scaffold.md" "$out"
j=docs/journal/0A-scaffold.md
check test -f "$j"
check has "# Milestone 0A — Scaffold and harness" "$j"
check has "| Roadmap | \`docs/05-roadmap.md §3.1\` |" "$j"
check has "| Branch | \`0A\` from \`master\` @ \`$base_sha\` |" "$j"
check has "| E1 | scaffold file present | mechanical | \`test -f scaffold.txt\` | PASS $(date +%F) @ $(git rev-parse --short HEAD) (fast) |" "$j"
check has "| E2 | owner sees the banner | owner | steps below | owner: no steps yet |" "$j"
check has "### Owner steps" "$j"
check has "### Task 1 — Scaffold files" "$j"
check has "### Task 2 — Banner" "$j"
check has "scaffold (\`scaffold.txt\`)" "$j"
check has "### Session-end writes" "$j"
check has "| 1 | plan | $(date +%F) | DONE | spec, impl plan, exit checks written |" "$j"
check has "| 2 | execute | $(date +%F) | CONTINUE | task 1 done; scaffold in place |" "$j"
check has "> | 2026-09-07 | Harness is vitest | 0A | done |" "$j"
check has "- \`docs/adr/0001-banner-in-core.md\`" "$j"
check has "## Notes" "$j"
check count_is "(fast) |" "$j" 1
check count_is " fast @" "$j" 0
"$here/journal" 0A --check > "$out" 2>&1 || true
check has "JOURNAL=ok (sessions 2, owner-steps 0/1)" "$out"

# --- worker adds owner steps and notes; both survive a rewrite ------------------------
python3 - "$j" <<'EOF' 2>/dev/null || perl -0pi -e 's/### Owner steps\n(<!--[^\n]*\n)*/### Owner steps\n**E2 — owner sees the banner**\n1. Open the app.\n2. Look at the top bar.\nExpected: the banner reads "0A".\n/; s/## Notes\n(<!--[^\n]*\n)*/## Notes\nThe banner colour is a placeholder.\n/' "$j"
import re, sys
p = sys.argv[1]; s = open(p).read()
s = re.sub(r"### Owner steps\n(<!--[^\n]*\n)*", '### Owner steps\n**E2 — owner sees the banner**\n1. Open the app.\n2. Look at the top bar.\nExpected: the banner reads "0A".\n', s)
s = re.sub(r"## Notes\n(<!--[^\n]*\n)*", "## Notes\nThe banner colour is a placeholder.\n", s)
open(p, "w").write(s)
EOF
"$here/exit-check" 0A --fast > "$out" 2>&1 || true
check has "OWNER (steps: docs/journal/0A-scaffold.md)" "$out"
"$here/journal" 0A > "$out" 2>&1 || true
check has "**E2 — owner sees the banner**" "$j"
check has "Expected: the banner reads \"0A\"." "$j"
check has "The banner colour is a placeholder." "$j"
check has "| E2 | owner sees the banner | owner | steps below | owner: steps below |" "$j"
"$here/journal" 0A --check > "$out" 2>&1 || true
check has "JOURNAL=ok (sessions 2, owner-steps 1/1)" "$out"

# --- the current handoff is rewritten (same N): its row is replaced, not duplicated ----
sed -i.bak 's/^outcome: CONTINUE/outcome: DONE/; s/^summary: .*/summary: tasks 1-2 done/' docs/sdd/0A/handoff.md; rm -f docs/sdd/0A/handoff.md.bak
"$here/journal" 0A > "$out" 2>&1 || true
check count_is "| 2 | execute |" "$j" 1
check has "| 2 | execute | $(date +%F) | DONE | tasks 1-2 done |" "$j"

# --- a full exit-check run lands in ### Runs; a fast one does not --------------------------
"$here/exit-check" 0A > "$out" 2>&1 || true
"$here/journal" 0A > "$out" 2>&1 || true
check has "- $(date +%F) full @ $(git rev-parse --short HEAD): 1 PASS 0 FAIL 1 OWNER" "$j"
check has "(full) |" "$j"
"$here/exit-check" 0A --fast > "$out" 2>&1 || true
"$here/journal" 0A > "$out" 2>&1 || true
check count_is "- $(date +%F) full @" "$j" 1
check count_is "- $(date +%F) fast @" "$j" 0

# --- status shows the JOURNAL= verdict line -------------------------------------------
"$here/status" 0A > "$out" 2>&1 || true
check has "JOURNAL=ok (sessions 2, owner-steps 1/1)" "$out"

# --- stale: a new session without a journal run ---------------------------------------
printf '{"milestone":"0A","role":"execute","session":3,"base":"%s"}\n' "$(git rev-parse HEAD)" > .claude/scope.json
"$here/journal" 0A --check > "$out" 2>&1 || true
check has "JOURNAL=stale (no Sessions row for session 3" "$out"

# --- merge, retire the STATUS row, remove the worktree: --recheck still works from the root ----
git add docs/journal; git commit -qm "journal" -m "[docs] journal 0A" >/dev/null
cd "$root"
git merge -q --no-ff 0A -m "Merge branch '0A'"
git worktree remove --force .worktrees/0A
sed -i.bak '/\*\*0A\*\*/d' docs/STATUS.md; rm -f docs/STATUS.md.bak; git add docs/STATUS.md; git commit -qm "retire row" >/dev/null
"$here/journal" 0A > "$out" 2>&1 && check false || check has "no worktree" "$out"
rc=0; "$here/journal" 0A --recheck > "$out" 2>&1 || rc=$?
check [ "$rc" = 0 ]
check has "E1  mechanical     PASS" "$out"
check has "E2  owner          OWNER (steps in docs/journal/0A-scaffold.md)" "$out"
check has "summary: 1 PASS 0 FAIL 1 OWNER 0 other" "$out"
check has "CHANGED: docs/journal/0A-scaffold.md" "$out"
check has "| E1 | scaffold file present | mechanical | \`test -f scaffold.txt\` | PASS $(date +%F) @ $(git rev-parse --short HEAD) (recheck) |" docs/journal/0A-scaffold.md
check has "- $(date +%F) recheck @ $(git rev-parse --short HEAD) on master: 1 PASS 0 FAIL 1 OWNER 0 other" docs/journal/0A-scaffold.md
check count_is "- $(date +%F) full @" docs/journal/0A-scaffold.md 1
# a failing check: exit 1, FAIL recorded
rm scaffold.txt
rc=0; "$here/journal" 0A --recheck > "$out" 2>&1 || rc=$?
check [ "$rc" = 1 ]
check has "E1  mechanical     FAIL (exit 1)" "$out"
check has "| FAIL $(date +%F) @" docs/journal/0A-scaffold.md
check count_is "recheck @" docs/journal/0A-scaffold.md 2

[ $fail = 0 ] && echo "all $n passed" || { echo "FAILED"; exit 1; }
