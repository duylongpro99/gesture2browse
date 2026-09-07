#!/usr/bin/env bash
# Tests for the adding-a-milestone flow: a roadmap that grows a second unstarted
# milestone (new phase 2A) next to an existing one (1A) must still parse, `check
# --milestone <M>` must validate the new row, and `next` must resolve its Plan
# inputs item by item. Fixture repo built in $TMPDIR. Run from anywhere:
#   scripts/milestone/tests/add-milestone.sh
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
check_bin="$here/../bootstrap/check"
work=$(mktemp -d "${TMPDIR:-/tmp}/add-milestone-test.XXXXXX"); [ "${KEEP_WORK:-}" = 1 ] && echo "work=$work" || trap 'rm -rf "$work"' EXIT
fail=0; n=0
check() { # predicate...: exit 0 = pass; on failure print the predicate and the last output
  n=$((n + 1)); if "$@"; then echo "ok $n - $*"; else echo "not ok $n - $*"; fail=1; [ -f "$out" ] && sed 's/^/    | /' "$out" | head -40; fi
}
has() { grep -Fq -- "$1" "$2"; }
lacks() { ! grep -Fq -- "$1" "$2"; }

mkdir "$work/repo"; cd "$work/repo"
git init -q -b master . 2>/dev/null || { git init -q .; git checkout -q -b master; }
git config user.email t@example.com; git config user.name t
mkdir -p docs/plans scripts; ln -s "$here" scripts/milestone   # the kit copy install would make
printf '# PRD\n\n## 1. Goals\n\n- ship\n\n## 7. Export\n\nCSV export of a board.\n' > docs/01-prd.md
# --- the roadmap as bootstrap left it: 0A and 1A ---
cat > docs/05-roadmap.md <<'ROADMAP'
# Roadmap

## 2. Milestones and planning rules

### 2.2 Phase map

| Phase | Milestones | Reason for the split |
|---|---|---|
| 0 | **0A** scaffold + harness | layout |
| 1 | **1A** vertical slice | one path end to end |

## 3. Phase 0 — Scaffold

### 3.1 Milestone 0A — Scaffold

| | |
|---|---|
| **Plan inputs** | 01–02 docs. No gate results needed. |
| **Exit** | pnpm test |

## 4. Phase 1 — Slice

### 4.1 Milestone 1A — Vertical slice

| | |
|---|---|
| **Plan inputs** | 0A |
| **Exit** | pnpm test; pnpm typecheck |

## 7. Working with Claude Code on this repo

## 8. Decision log

| Date | Decision | Input | Result |
|---|---|---|---|
| 2026-09-04 | Estimation model | Owner | v0.1 |

## 9. Top risks and re-plan triggers

| Phase | Risk | Trigger | Response |
|---|---|---|---|
| 0 | none | — | — |
ROADMAP
cat > docs/STATUS.md <<'STATUS'
# Status

## Project (owner or integration session only)

- **Decisions pending** (inputs in roadmap §8): none.

## Active workstreams (one row per milestone; edit only your row)

| Milestone | Owner session | State (one sentence) | Plan | Updated |
|---|---|---|---|---|
| **1A** | unclaimed | not started | `docs/plans/1A-vertical-slice.md` | 2026-09-01 |
STATUS
git add -A; git commit -qm "init"
echo scaffold > scaffold.txt; git add -A; git commit -qm "[0A] scaffold, harness"   # 0A merged by squash

out=$work/out
# --- baseline: one unstarted milestone ---
"$here/next" > "$out" 2>&1 || true
check has "READY: 1A — 0A merged" "$out"
check lacks "2A" "$out"

# --- adding-a-milestone stages 2 and 3: new phase 2, row 2A, STATUS row, pending §8 row ---
cat > docs/05-roadmap.md <<'ROADMAP'
# Roadmap

## 2. Milestones and planning rules

### 2.2 Phase map

| Phase | Milestones | Reason for the split |
|---|---|---|
| 0 | **0A** scaffold + harness | layout |
| 1 | **1A** vertical slice | one path end to end |
| 2 | **2A** CSV export | a second consumer of the board schema |

## 3. Phase 0 — Scaffold

### 3.1 Milestone 0A — Scaffold

| | |
|---|---|
| **Plan inputs** | 01–02 docs. No gate results needed. |
| **Exit** | pnpm test |

## 4. Phase 1 — Slice

### 4.1 Milestone 1A — Vertical slice

| | |
|---|---|
| **Plan inputs** | 0A |
| **Exit** | pnpm test; pnpm typecheck |

## 5. Phase 2 — Export

### 5.1 Milestone 2A — CSV export

| | |
|---|---|
| **Plan inputs** | 1A merged; docs/01-prd.md §7; owner's sample board file |
| **Plan scope** | export one board as CSV |
| **Interfaces fixed here** | none: extends 1A's Board schema. Consumed by the CLI. |
| **Sessions** | 2 |
| **Exit** | pnpm test -- export; pnpm exec app export fixtures/board.json produces 12 rows |

## 7. Working with Claude Code on this repo

## 8. Decision log

| Date | Decision | Input | Result |
|---|---|---|---|
| 2026-09-04 | Estimation model | Owner | v0.1 |
| — | CSV column order | Owner | pending; unblocks 2A |

## 9. Top risks and re-plan triggers

| Phase | Risk | Trigger | Response |
|---|---|---|---|
| 0 | none | — | — |
ROADMAP
echo '| **2A** | unclaimed | not started | `docs/plans/2A-csv-export.md` | 2026-09-07 |' >> docs/STATUS.md

# --- lib: both rows parse, the new heading is found ---
# shellcheck disable=SC1090
. "$here/lib.sh"
ms_roadmap_milestones docs/05-roadmap.md > "$out"
check has "2A	1A merged; docs/01-prd.md §7; owner's sample board file" "$out"
check test "$(wc -l < "$out" | tr -d ' ')" = 3
check test "$(ms_roadmap_section 2A docs/05-roadmap.md)" = 5.1
check test "$(ms_status_slug 2A docs/STATUS.md)" = 2A-csv-export
check test "$(ms_status_owner 2A docs/STATUS.md)" = unclaimed

# --- next: the new row resolves item by item; the old row is untouched ---
"$here/next" --inputs 2A > "$out" 2>&1 && rc=0 || rc=$?
check test "$rc" = 1
check has "BLOCKED: 2A — 1A unstarted, not merged; docs/01-prd.md §7 (doc, present); owner's sample board file (OWNER)" "$out"
"$here/next" --inputs 1A > "$out" 2>&1 && rc=0 || rc=$?
check test "$rc" = 0
check has "READY: 1A — 0A merged" "$out"
"$here/next" > "$out" 2>&1 || true
check has "READY: 1A — 0A merged" "$out"
check has "BLOCKED: 2A — 1A unstarted, not merged" "$out"

# --- once 1A is merged, only the owner item blocks 2A ---
git add -A; git commit -qm "[docs] add milestone 2A: CSV export"
echo slice > slice.txt; git add -A; git commit -qm "[1A] vertical slice"
"$here/next" --inputs 2A > "$out" 2>&1 && rc=0 || rc=$?
check test "$rc" = 1
check has "BLOCKED: 2A — 1A merged; docs/01-prd.md §7 (doc, present); owner's sample board file (OWNER)" "$out"

# --- check: default picks the first roadmap row with a STATUS row; --milestone validates the new one ---
if [ -x "$check_bin" ]; then
  "$check_bin" --no-tests > "$out" 2>&1 || true
  check has "OK: roadmap — 3 milestone rows: 0A 1A 2A" "$out"
  check has "OK: roadmap-ids — every id matches" "$out"
  check has "OK: roadmap-ids — every milestone has a" "$out"
  check has "OK: roadmap-cells — every milestone has an Exit cell" "$out"
  check has "OK: status — row 1A unclaimed, slug 1A-vertical-slice" "$out"
  check has "OK: next — 1A is READY for claim" "$out"
  "$check_bin" --no-tests --milestone 2A > "$out" 2>&1 || true
  check has "OK: status — row 2A unclaimed, slug 2A-csv-export" "$out"
  check has "OWNER: next — 2A BLOCKED; each '(OWNER)' item is the owner's to confirm" "$out"
  check lacks "OWNER: git" "$out"
  check lacks "MALFORMED: roadmap" "$out"
  check lacks "MALFORMED: status" "$out"
else
  echo "# skip check tests: $check_bin not found"
fi

[ $fail = 0 ] && echo "# all $n passed" || { echo "# FAILED"; exit 1; }
