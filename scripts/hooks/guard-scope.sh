#!/usr/bin/env bash
# Claude Code hook: keep a driving-a-milestone worker inside its role's paths.
#
# Enabled by the presence of .claude/scope.json in the project root; the file is
# written by scripts/milestone/spawn (see scripts/milestone/scope for its
# shape) and is gitignored. Without it this hook is a no-op, so owner sessions
# in the root checkout are unaffected. With it:
#
# PreToolUse (Write|Edit|MultiEdit|NotebookEdit|Bash)
#   - Write/Edit/NotebookEdit: the target path must match an `allow` glob and
#     no `deny` glob; anything outside the project is denied except the
#     system temp dirs (finish clones into $TMPDIR).
#   - Bash: a single read-only command passes. Otherwise every simple command
#     (split on ; && || | and newlines, heredoc bodies removed) is checked:
#     redirect targets and the path arguments of mutating commands (rm mv cp
#     touch mkdir tee ln chmod truncate install rmdir patch, sed/perl -i,
#     git add/rm/mv/restore/checkout/apply) must be in scope; history-rewriting
#     or tree-switching git commands, `git add -A|.|-u`, `git commit -a`,
#     `git -C <outside dir>`, eval/xargs/sh -c/bash -c and find -delete/-exec
#     are denied outright. Anything else (pnpm, tsc, vitest, node, gh, git
#     commit) runs, and PostToolUse checks what it left behind.
# PostToolUse (Bash|Write|Edit|MultiEdit|NotebookEdit)
#   - if `git status --porcelain` shows a tracked or untracked path outside the
#     scope, block with the list, so a build tool or script that wrote out of
#     scope is reverted before the worker continues.
#
# Standalone: `guard-scope.sh --classify <path>...` prints `ok|deny <path>` per
# argument using the same rules; scripts/milestone/status uses it.
#
# The denial text tells the worker the only sanctioned way out: hand off
# NEEDS-OWNER with the path and the reason. The scope file, settings, and the
# hooks directory are always denied so a worker cannot widen its own scope.
set -u
set -f  # never glob-expand tokens taken from a command line

root=${CLAUDE_PROJECT_DIR:-}
[ -n "$root" ] || root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
root=${root%/}
scope="$root/.claude/scope.json"
[ -f "$scope" ] || exit 0

allow=$(jq -r '.allow[]?' "$scope")
deny=$(jq -r '.deny[]?' "$scope")
role=$(jq -r '.role // "?"' "$scope")
milestone=$(jq -r '.milestone // "?"' "$scope")

# --- helpers ------------------------------------------------------------------

# glob → anchored ERE. `**` = anything, `*` = anything but `/`, `?` = one char.
glob_re() {
  local star; star=$(printf '\001')
  # BSD sed: escape each ERE metacharacter separately (no `]` inside a bracket).
  printf '%s' "$1" | sed -e 's/\./\\./g' -e 's/\[/\\[/g' -e 's/\]/\\]/g' -e 's/(/\\(/g' -e 's/)/\\)/g' \
    -e 's/+/\\+/g' -e 's/\^/\\^/g' -e 's/\$/\\$/g' -e 's/|/\\|/g' -e 's/{/\\{/g' -e 's/}/\\}/g' \
    -e "s|\*\*|$star|g" -e 's|\*|[^/]*|g' -e "s|$star|.*|g" -e 's|?|[^/]|g' \
    -e 's|^|^|' -e 's|$|$|'
}

matches_any() { # $1 = repo-relative path, stdin = globs
  local p=$1 g
  while IFS= read -r g; do
    [ -n "$g" ] || continue
    printf '%s' "$p" | grep -Eq "$(glob_re "$g")" && return 0
  done
  return 1
}

# Lexically normalize a path against a base directory. Prints one of:
#   rel:<repo-relative path>   inside the project
#   tmp                        under $TMPDIR, /tmp, /private/tmp, /var/folders
#   dev                        /dev/null, /dev/stderr, /dev/stdout
#   var                        contains an unexpanded $variable we cannot resolve
#   out                        outside the project
normalize() { # $1 = token, $2 = cwd (absolute)
  local t=$1 cwd=$2 abs out seg
  t=${t#\"}; t=${t%\"}; t=${t#\'}; t=${t%\'}
  case "$t" in
    /dev/null|/dev/stderr|/dev/stdout) echo dev; return ;;
    '$TMPDIR'*|'${TMPDIR'*|'$TMPDIR/'*) echo tmp; return ;;
    *'$'*) echo var; return ;;
    /*) abs=$t ;;
    '~'*) echo out; return ;;
    *) abs="$cwd/$t" ;;
  esac
  out=""
  IFS=/ read -ra parts <<< "$abs"
  for seg in "${parts[@]}"; do
    case "$seg" in
      ""|.) ;;
      ..) out=${out%/*} ;;
      *) out="$out/$seg" ;;
    esac
  done
  [ -n "$out" ] || out=/
  case "$out" in
    "$root") echo "rel:." ;;
    "$root"/*) echo "rel:${out#"$root"/}" ;;
    "$(dirname "$root")"/*) echo out ;;   # sibling worktrees and the root checkout, even under a temp dir
    /tmp/*|/private/tmp/*|/private/var/folders/*|/var/folders/*|"${TMPDIR:-/nonexistent}"*) echo tmp ;;
    *) echo out ;;
  esac
}

# Print `ok` or `deny` for one token. $2 = cwd.
classify() {
  local n; n=$(normalize "$1" "$2")
  case "$n" in
    dev|tmp) echo ok ;;
    var|out) echo deny ;;
    rel:*)
      local p=${n#rel:}
      if printf '%s\n' "$deny" | matches_any "$p"; then echo deny
      elif printf '%s\n' "$allow" | matches_any "$p"; then echo ok
      else echo deny; fi ;;
  esac
}

deny_pre() {
  local why=$1
  local msg="Out of scope for milestone $milestone role $role: $why. Your writes are limited to the globs in .claude/scope.json (driving-a-milestone). Do not work around this and never edit .claude/scope.json, .claude/settings*.json or scripts/hooks/. If the task truly needs this path, stop and hand off outcome: NEEDS-OWNER with the path and the reason in owner-questions."
  jq -n --arg r "$msg" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

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

# --- standalone mode ----------------------------------------------------------
if [ "${1:-}" = "--classify" ]; then
  shift
  for p in "$@"; do echo "$(classify "$p" "$root") $p"; done
  exit 0
fi

# --- hook mode ----------------------------------------------------------------
input=$(cat)
event=$(printf '%s' "$input" | jq -r '.hook_event_name // empty')
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
[ -n "$cwd" ] || cwd=$root

readonly_tools='^[[:space:]]*(grep|rg|cat|head|tail|less|wc|diff|ls|find|stat|file|echo|printf|pwd|which|type|tree|du|jq|git (status|diff|log|show|rev-parse|blame|branch|ls-files|merge-base|rev-list|check-ignore|remote|describe))([[:space:]]|$)'
mutating='^(rm|mv|cp|touch|mkdir|tee|ln|chmod|chown|truncate|install|rmdir|patch|unzip|tar)$'

check_bash() {
  local cmd=$1 line simple first sub tok n
  # Read-only bypass: one line, one simple command, no ; & | > and no find -delete/-exec.
  if [ "$(printf '%s\n' "$cmd" | wc -l)" -eq 1 ] && ! printf '%s' "$cmd" | grep -q '[;&|>]' \
     && printf '%s' "$cmd" | grep -Eq "$readonly_tools" \
     && ! printf '%s' "$cmd" | grep -Eq -- '-(delete|exec|execdir|ok|fprint|fls)'; then return 0; fi
  cmd=$(printf '%s\n' "$cmd" | strip_heredocs)
  # Protected literals anywhere in a non-read-only command.
  if printf '%s' "$cmd" | grep -Eq '\.claude/(scope\.json|settings[^ ]*\.json)|scripts/hooks/|(^|[ /"'"'"'])\.git/'; then
    echo "the command names a protected file (.claude/scope.json, .claude/settings*.json, scripts/hooks/, .git/)"; return 0
  fi
  # Redirect targets.
  for tok in $(printf '%s' "$cmd" | grep -oE '(^|[^>&0-9])[0-9]?>>?[|]?[[:space:]]*[^[:space:];&|>]+' | sed -E 's/^.*>>?[|]?[[:space:]]*//'); do
    case "$tok" in \&*) continue ;; esac
    [ "$(classify "$tok" "$cwd")" = ok ] || { echo "redirect into $tok"; return 0; }
  done
  # Simple commands.
  printf '%s\n' "$cmd" | awk '{ gsub(/&&|\|\||;|\|/, "\n"); print }' | while IFS= read -r simple; do
    simple=$(printf '%s' "$simple" | sed -E 's/^[[:space:]]*//; s/^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*//; s/^(sudo|env|command|nohup|time|exec)[[:space:]]+//')
    [ -n "$simple" ] || continue
    set -- $simple
    first=$1; shift || true
    case "$first" in
      eval|xargs|sh|bash|zsh|source|.) echo "DENY:$first is not allowed in a scoped session; run the command directly with literal paths" ;;
      find) printf '%s' "$*" | grep -Eq -- '-(delete|exec|execdir|ok)' && echo "DENY:find with -delete/-exec; delete with rm <path>" ;;
      sed|perl)
        printf '%s' "$*" | grep -Eq '(^|[[:space:]])-[a-zA-Z]*i' || continue
        for tok in "$@"; do
          case "$tok" in -*) continue ;; esac
          [ -e "$cwd/${tok#\"}" ] || [ -e "${tok#\"}" ] || continue
          [ "$(classify "$tok" "$cwd")" = ok ] || echo "DENY:in-place edit of $tok"
        done ;;
      git)
        if [ "${1:-}" = "-C" ]; then
          [ "$(normalize "${2:-.}" "$cwd")" = tmp ] || echo "DENY:git -C outside the temp dir"
          shift 2 || true
        fi
        case "${1:-}" in
          --git-dir*|--work-tree*) echo "DENY:git --git-dir/--work-tree" ;;
          switch|rebase|merge|reset|cherry-pick|revert|am|stash|clean|worktree|filter-branch|filter-repo|update-ref|reflog)
            echo "DENY:git $1 rewrites or switches the tree; a scoped session keeps linear history on its branch (use git restore <path>)" ;;
          add)
            shift
            [ $# -gt 0 ] || echo "DENY:git add needs explicit paths"
            for tok in "$@"; do
              case "$tok" in
                -A|--all|-u|--update|.|:/|:/*|-i|--interactive|-p|--patch) echo "DENY:git add $tok; stage the task's files by explicit path so each commit holds exactly one task" ;;
                -*) ;;
                *) [ "$(classify "$tok" "$cwd")" = ok ] || echo "DENY:git add $tok" ;;
              esac
            done ;;
          rm|mv|restore|apply)
            sub=$1; shift
            for tok in "$@"; do
              case "$tok" in -*|--) continue ;; esac
              [ "$(classify "$tok" "$cwd")" = ok ] || echo "DENY:git $sub $tok"
            done ;;
          checkout)
            shift
            printf '%s' "$*" | grep -q -- '--' || echo "DENY:git checkout without -- (switching refs); use git restore -- <path> for files"
            for tok in "$@"; do
              case "$tok" in -*|--) continue ;; esac
              [ "$(classify "$tok" "$cwd")" = ok ] || echo "DENY:git checkout $tok"
            done ;;
          commit)
            printf '%s' "$*" | grep -Eq '(^|[[:space:]])(-a|--all|-[a-zA-Z]*a[a-zA-Z]*)([[:space:]]|$)' \
              && echo "DENY:git commit -a; git add the task's files explicitly (one task per commit)" ;;
        esac ;;
      *)
        if printf '%s' "$first" | grep -Eq "$mutating"; then
          for tok in "$@"; do
            case "$tok" in -*|+*|[0-9]*) continue ;; esac
            [ "$(classify "$tok" "$cwd")" = ok ] || echo "DENY:$first $tok"
          done
        fi ;;
    esac
  done | grep -m1 '^DENY:' | sed 's/^DENY://'
}

if [ "$event" = "PreToolUse" ]; then
  case "$tool" in
    Write|Edit|MultiEdit|NotebookEdit)
      target=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
      [ -n "$target" ] || exit 0
      [ "$(classify "$target" "$cwd")" = ok ] || deny_pre "$tool to $target"
      exit 0 ;;
    Bash)
      command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
      [ -n "$command" ] || exit 0
      why=$(check_bash "$command")
      [ -z "$why" ] || deny_pre "$why"
      exit 0 ;;
  esac
  exit 0
fi

if [ "$event" = "PostToolUse" ]; then
  case "$tool" in Bash|Write|Edit|MultiEdit|NotebookEdit) ;; *) exit 0 ;; esac
  bad=""
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    p=${line:3}
    case "$p" in *" -> "*) p=${p##* -> } ;; esac
    p=${p#\"}; p=${p%\"}
    [ "$(classify "$root/$p" "$root")" = ok ] || bad="$bad $p"
  done < <(cd "$root" && git status --porcelain --untracked-files=all 2>/dev/null)
  if [ -n "$bad" ]; then
    jq -n --arg r "Out of scope for milestone $milestone role $role: the working tree now has changes outside your allowed paths:$bad. Revert them (git restore -- <path>, or rm for new files) before doing anything else. If the task truly needs them, hand off outcome: NEEDS-OWNER with each path and its reason; never edit .claude/scope.json." '{decision:"block",reason:$r}'
  fi
  exit 0
fi
exit 0
