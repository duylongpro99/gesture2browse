#!/usr/bin/env bash
# Tests for scripts/milestone/next and scripts/milestone/log-decision against a
# fixture repo built in $TMPDIR (docs/tickets/0001). Run from anywhere:
#   scripts/milestone/tests/post-finish.sh
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/post-finish-test.XXXXXX"); [ "${KEEP_WORK:-}" = 1 ] && echo "work=$work" || trap 'rm -rf "$work"' EXIT
fail=0; n=0
check() { # predicate...: exit 0 = pass; on failure print the predicate and the last output
  n=$((n + 1)); if "$@"; then echo "ok $n - $*"; else echo "not ok $n - $*"; fail=1; [ -f "$out" ] && sed 's/^/    | /' "$out" | head -40; fi
}
has() { grep -Fq -- "$1" "$2"; }
lacks() { ! grep -Fq -- "$1" "$2"; }

cd "$work"
git init -q -b master . 2>/dev/null || { git init -q .; git checkout -q -b master; }
git config user.email t@example.com; git config user.name t
mkdir -p docs/plans
cat > docs/05-roadmap.md <<'EOF'
# Roadmap

## 3. Phase 0

### 3.1 Milestone 0A — Scaffold

| | |
|---|---|
| **Plan inputs** | 01–04 docs. No gate results needed. |
| **Exit** | green |

### 3.2 Milestones 0B–0E — Gate probes

| Milestone | Gate | Task | Plan inputs | Sessions |
|---|---|---|---|---|
| **0B** | G1 | Frame pump | 0A | 2 |
| **0D** | G5 | Click survey | 0A | 1 |
| **0E** | G7 | Latency probe | 0A, owner's API key | 1 |

## 4. Phase 1

### 4.1 Milestone 1A — Vertical slice

| | |
|---|---|
| **Plan inputs** | G1 (frame pump path), G5 (dispatch default), G8 go. G3, G4, G6 are **not** required. |

### 4.3 Milestone 1C — Page plane

| | |
|---|---|
| **Plan inputs** | 1A merged; G5 (dispatch default, CDP opt-in shape); G6 (pinch vs dwell). |

## 8. Decision log

| Date | Decision | Input | Result |
|---|---|---|---|
| 2026-09-04 | Estimation model | Owner | v0.2 |
| — | Click dispatch default (content-script vs CDP) | G5 (0D) | pending; unblocks 1A, 1C |
| — | Click mode default | G6 | pending; unblocks 1C |
| — | Snap radius | G5, G6 | pending; tunable |

## 9. Risks
EOF
cat > docs/STATUS.md <<'EOF'
# Status

| Milestone | Owner session | State (one sentence) | Plan | Updated |
|---|---|---|---|---|
| 0D click survey | drv-0D | **DONE.** PR open. | `docs/plans/0D-click.md` | 2026-09-10 |
| 0E latency probe | unclaimed | not started | `docs/plans/0E-latency.md` | 2026-09-01 |
EOF
git add -A; git commit -qm "init"
# 0A merged by squash (subject names it)
echo scaffold > scaffold.txt; git add -A; git commit -qm "[0A] scaffold, harness"
# 0D on its own branch (and in its worktree, as claim leaves it), merged with a merge commit
git checkout -qb 0D
cat > docs/plans/0D-click.md <<'EOF'
# 0D click survey

## Status

**Done:** survey ran.

**Proposed decision for roadmap §8 (owner logs; agent does not edit §8):**
> | 2026-09-10 | **G5 (0D) click dispatch default = content-script.** CDP opt-in. | G5 (0D): 20-site survey | Recorded in `spike-results.md §G5` |

**Blockers:** none.
EOF
git add -A; git commit -qm "[docs] 0D plan"
git checkout -q master
git worktree add -q .worktrees/0D 0D

out=$work/out
# --- before the merge ---
"$here/next" 0D > "$out" 2>&1
check has "STATE: 0D active (drv-0D), not merged" "$out"
check has "PROPOSED-8-ROW: ok" "$out"
check has "BLOCKED: 1A — G1 pending (0B); G5 pending (0D); G8 pending" "$out"
check lacks "G3" "$out"
check has "READY: 0B — 0A merged" "$out"
check has "BLOCKED: 0E — 0A merged; owner's API key (OWNER)" "$out"
check has "BLOCKED: 1C — 1A unstarted, not merged; G5 pending (0D); G6 pending" "$out"
check lacks "0D —" "$out"   # 0D is active, not listed
if "$here/log-decision" 0D > "$out" 2>&1; then rc=0; else rc=$?; fi
check test "$rc" = 5
check has "REFUSED: 0D active" "$out"
"$here/next" --inputs 0A > "$out" 2>&1 && rc=0 || rc=$?
check test "$rc" = 0
check has "READY: 0A" "$out"
"$here/next" --inputs 1A > "$out" 2>&1 && rc=0 || rc=$?
check test "$rc" = 1

# --- merge 0D ---
git merge -q --no-ff -m "Merge branch '0D'" 0D
"$here/next" 0D > "$out" 2>&1
check has "STATE: 0D merged into master" "$out"
check has "STATUS-ROW: present" "$out"

# --- dry run ---
"$here/log-decision" 0D > "$out" 2>&1
check has "INSERT: | 2026-09-10 | **G5 (0D) click dispatch default = content-script.**" "$out"
check has "REPLACE: pending row (line" "$out"
check has "Click dispatch default (content-script vs CDP)" "$out"
check has "KEEP: pending row" "$out"
check has "still needs: G6" "$out"
check has "STATUS-ROW: remove line" "$out"
check has "summary: dry-run" "$out"
check git diff --quiet -- docs   # nothing written
before=$(git rev-parse HEAD)

# --- apply ---
"$here/log-decision" 0D --apply > "$out" 2>&1
check has "COMMIT:" "$out"
check test "$(git rev-parse HEAD)" != "$before"
check git diff --quiet HEAD -- docs
check has "| 2026-09-10 | **G5 (0D) click dispatch default" docs/05-roadmap.md
check lacks "| — | Click dispatch default" docs/05-roadmap.md
check has "| — | Snap radius | G5, G6 |" docs/05-roadmap.md
check has "| — | Click mode default | G6 |" docs/05-roadmap.md
check lacks "drv-0D" docs/STATUS.md
check has "0E latency probe" docs/STATUS.md
# the new row sits right after the last dated row
check test "$(awk '/^\| 2026-09-04/{a=NR} /^\| 2026-09-10/{b=NR} END{print b-a}' docs/05-roadmap.md)" = 1
"$here/next" --inputs 1C > "$out" 2>&1 || true
check has "BLOCKED: 1C — 1A unstarted, not merged; G5 logged; G6 pending" "$out"
"$here/next" 0D > "$out" 2>&1
check has "STATUS-ROW: absent" "$out"
# a second run refuses: the row is already logged (no duplicate §8 rows)
if "$here/log-decision" 0D > "$out" 2>&1; then rc=0; else rc=$?; fi
check test "$rc" = 7
check has "REFUSED: this row is already in §8" "$out"

[ $fail = 0 ] && echo "all $n passed" || { echo "FAILED"; exit 1; }
