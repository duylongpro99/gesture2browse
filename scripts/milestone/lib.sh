#!/usr/bin/env bash
# Shared parsers and configuration for scripts/milestone/* and scripts/bootstrap/*.
# Source it: `. "$(dirname "$0")/lib.sh"` (every script sits in scripts/milestone/,
# bootstrap scripts use ../milestone/lib.sh).
#
# One definition per format the milestone flow reads, so the bootstrap `check`
# validates a document with the same code that later drives it (no drift
# between "what check accepts" and "what claim/next/brief parse"):
#   ms_status_row M [STATUS]        the docs/STATUS.md row for milestone M
#   ms_status_owner M [STATUS]      its "Owner session" cell
#   ms_status_slug M [STATUS]       plan-file stem from its Plan cell (else M)
#   ms_roadmap_milestones ROADMAP   TSV id \t "Plan inputs" cell \t gate, one row per milestone
#   ms_roadmap_s8 ROADMAP           TSV Input cell \t Result cell, one row per §8 table row
#   ms_roadmap_section M ROADMAP    the `### x.y` number of the heading naming M (or a range holding it)
#   ms_load_config [ROOT]           project config (scripts/milestone/config) with defaults
#
# Config keys (all optional; scripts/milestone/config is `KEY=value` lines, sourced):
#   MS_PANE_PREFIX      Herdr pane / session name prefix        default: ms
#   MS_COMPONENT_ROOTS  dirs whose first child is one component (a plan path
#                       packages/x/src/a.ts opens packages/x/**)  default: "packages apps"
#   MS_WHOLE_DIRS       dirs opened whole when a plan path is under them
#                                                              default: "fixtures .github"
#   MS_CONTRACT_GLOBS   where the plan role writes contract tests; every other role is denied
#                       default: "packages/*/test/contracts/** apps/*/test/contracts/**"
#   MS_DEFAULT_BASE     base branch when driver.json has none    default: main branch of the repo, else master
#   MS_CHECK_ALLOW      ERE for the first word of an ## Exit checks command exit-check may run
#                       default: ^(pnpm|npx|node|turbo|tsc|vitest|playwright|bash|sh|test|\[|scripts/)

ms_root() { dirname "$(git rev-parse --path-format=absolute --git-common-dir)"; }

ms_load_config() {
  local root=${1:-$(ms_root)}
  MS_PANE_PREFIX=ms
  MS_COMPONENT_ROOTS="packages apps"
  MS_WHOLE_DIRS="fixtures .github"
  MS_CONTRACT_GLOBS="packages/*/test/contracts/** apps/*/test/contracts/**"
  MS_DEFAULT_BASE=""
  MS_CHECK_ALLOW='^(pnpm|npx|node|turbo|tsc|vitest|playwright|bash|sh|test|\[|scripts/)'
  # shellcheck disable=SC1091
  [ -f "$root/scripts/milestone/config" ] && . "$root/scripts/milestone/config"
  if [ -z "$MS_DEFAULT_BASE" ]; then
    MS_DEFAULT_BASE=$(git -C "$root" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
    [ -n "$MS_DEFAULT_BASE" ] || MS_DEFAULT_BASE=master
  fi
  export MS_PANE_PREFIX MS_COMPONENT_ROOTS MS_WHOLE_DIRS MS_CONTRACT_GLOBS MS_DEFAULT_BASE MS_CHECK_ALLOW
}

# ---- docs/STATUS.md ---------------------------------------------------------------
# A row: `| **<M>** | <owner session> | <state sentence> | `docs/plans/<slug>.md` | <date> |`
ms_status_row()   { grep -E "^\| \*{0,2}${1}[ *|]" "${2:-docs/STATUS.md}" 2>/dev/null || true; }
ms_status_owner() { ms_status_row "$1" "${2:-}" | awk -F'|' '{gsub(/^ +| +$/,"",$3); print $3}'; }
ms_status_slug()  {
  local s; s=$(ms_status_row "$1" "${2:-}" | sed -n 's|.*docs/plans/\([A-Za-z0-9._-]*\)\.md.*|\1|p')
  printf '%s\n' "${s:-$1}"
}

# ---- docs/05-roadmap.md -----------------------------------------------------------
# Two forms: a `### x.y Milestone <ID> —` heading followed by a `| **Plan inputs** | … |`
# row, and a table whose header has a `Plan inputs` column, rows `| **<ID> …** | … |`.
ms_roadmap_milestones() {
  awk -F'|' '
    function cell(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
    function strip(s) { gsub(/\*/, "", s); return cell(s) }
    /^###[ \t]+[0-9]+(\.[0-9]+)*[ \t]+Milestone[ \t]/ {
      hid = $0; sub(/^###[ \t]+[0-9]+(\.[0-9]+)*[ \t]+Milestone[ \t]+/, "", hid); sub(/[ \t].*$/, "", hid)
      intable = 0; next
    }
    /^###/ { hid = ""; intable = 0; next }
    hid != "" && $2 ~ /^[ \t]*\*\*Plan inputs\*\*[ \t]*$/ { printf "%s\t%s\t\n", hid, cell($3); hid = ""; next }
    /^\|/ && !intable {
      pi = 0; gc = 0
      for (i = 2; i < NF; i++) { c = strip($i); if (c == "Plan inputs") pi = i; if (c == "Gate") gc = i }
      if (pi) { intable = 1; hid = "" }
      next
    }
    intable && /^\|[ \t]*-/ { next }
    intable && /^\|[ \t]*\*\*/ {
      id = strip($2); sub(/[ \t].*$/, "", id)
      printf "%s\t%s\t%s\n", id, cell($pi), (gc ? strip($gc) : "")
      next
    }
    intable && !/^\|/ { intable = 0 }
  ' "$1"
}

# §8 rows: Input cell \t Result cell (header and separator dropped). The heading must be `## 8.`.
ms_roadmap_s8() {
  awk -F'|' '/^## 8\./{p=1; next} /^## /{p=0} p && /^\|/ && NF >= 5 && $2 !~ /^[ \t]*-+[ \t]*$/ && $2 !~ /Date/ {
    gsub(/^[ \t]+|[ \t]+$/, "", $4); gsub(/^[ \t]+|[ \t]+$/, "", $5); printf "%s\t%s\n", $4, $5 }' "$1"
}

# Section number of the `### x.y Milestone(s) …` heading naming M exactly, else the one
# whose range (e.g. 0B–0E) contains it. Prints nothing when neither exists.
ms_roadmap_section() {
  awk -v m="$1" '
    /^###[ \t]+[0-9]+(\.[0-9]+)*[ \t]+Milestones?[ \t]/ {
      sec = $2; rest = $0
      if (rest ~ ("[ \t]" m "([^A-Za-z0-9.]|$)")) { print sec; exit }
      # ranges: 0B–0E (letter run) or 1D.1–1D.6 (numeric suffix run)
      if (match(rest, /[0-9]+[A-Z]\.[0-9]+[–-][0-9]+[A-Z]\.[0-9]+/)) {
        r = substr(rest, RSTART, RLENGTH); gsub(/–/, "-", r); split(r, ab, "-")
        pa = ab[1]; sub(/\.[0-9]+$/, "", pa); pm = m; sub(/\.[0-9]+$/, "", pm)
        na = ab[1]; sub(/^.*\./, "", na); nb = ab[2]; sub(/^.*\./, "", nb); nm = m; sub(/^.*\./, "", nm)
        if (pa == pm && m ~ /\./ && na + 0 <= nm + 0 && nm + 0 <= nb + 0) { print sec; exit }
      } else if (match(rest, /[0-9]+[A-Z][–-][0-9]+[A-Z]/)) {
        r = substr(rest, RSTART, RLENGTH); gsub(/–/, "-", r)
        split(r, ab, "-"); a = ab[1]; b = ab[2]
        if (substr(a, 1, length(a) - 1) == substr(m, 1, length(m) - 1) && substr(a, length(a)) <= substr(m, length(m)) && substr(m, length(m)) <= substr(b, length(b))) { print sec; exit }
      }
    }' "$2"
}

# ---- docs/plans/<SLUG>.impl.md ---------------------------------------------------
# Task headings (outside code fences): prints the task numbers.
ms_impl_tasks() {
  awk '/^```/ { f = !f } !f && /^#+[ \t]+Task[ \t]+[0-9]+/ { match($0, /Task[ \t]+[0-9]+/); t = substr($0, RSTART, RLENGTH); sub(/Task[ \t]+/, "", t); print t }' "$1" | sort -un
}
