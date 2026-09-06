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
#   - Bash: a single read-only command passes. Otherwise the command is lexed
#     the way the shell reads it (quotes and backslashes resolved, heredoc
#     bodies dropped, `$(…)`, `(…)`, backticks, `;` `&&` `||` `|` `&` and
#     newlines split simple commands, `cd` moves the working directory for
#     the rest of the line, `NAME=value` assigned earlier in the same line is
#     expanded) and every simple command is checked: redirect targets and the
#     path arguments of mutating commands (rm mv cp touch mkdir tee ln chmod
#     truncate install rmdir patch, sed/perl -i, git add/rm/mv/restore/
#     checkout/apply) must be in scope; history-rewriting or tree-switching
#     git commands, `git add -A|.|-u`, `git commit -a`, `git -C <outside dir>`,
#     eval/xargs/sh -c/bash -c and find -delete/-exec are denied outright.
#     A `>` inside a quoted string (commit message, grep pattern, `node -e`
#     source) is text, not a redirect. Anything else (pnpm, tsc, vitest, node,
#     gh, git commit) runs, and PostToolUse checks what it left behind.
# PostToolUse (Bash|Write|Edit|MultiEdit|NotebookEdit)
#   - if `git status --porcelain` shows a tracked or untracked path outside the
#     scope, block with the list, so a build tool or script that wrote out of
#     scope is reverted before the worker continues.
#
# Standalone: `guard-scope.sh --classify <path>...` prints `ok|deny <path>` per
# argument using the same rules; scripts/milestone/status uses it.
# `guard-scope.sh --check-bash` reads a command on stdin and prints the denial
# reason (empty = allowed) without needing hook JSON; the tests use it.
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

# Lexically resolve a path against a base directory: absolute, no `.`/`..`,
# leading `~` expanded. No filesystem access.
abspath() { # $1 = token, $2 = cwd (absolute)
  local t=$1 cwd=$2 abs out seg
  case "$t" in
    /*) abs=$t ;;
    '~') abs=${HOME:-/nonexistent} ;;
    '~/'*) abs=${HOME:-/nonexistent}/${t#\~/} ;;
    *) abs="$cwd/$t" ;;
  esac
  out=""
  IFS=/ read -ra parts <<< "$abs"
  for seg in ${parts[@]+"${parts[@]}"}; do
    case "$seg" in
      ""|.) ;;
      ..) out=${out%/*} ;;
      *) out="$out/$seg" ;;
    esac
  done
  [ -n "$out" ] || out=/
  printf '%s' "$out"
}
root=$(abspath "$root" /)   # CLAUDE_PROJECT_DIR may carry `//` or `/./`; compare canonical forms

# Normalize a path token against a base directory. Prints one of:
#   rel:<repo-relative path>   inside the project
#   tmp                        under $TMPDIR, /tmp, /private/tmp, /var/folders
#   dev                        /dev/null, /dev/stderr, /dev/stdout
#   var                        contains an unexpanded $variable we cannot resolve
#   out                        outside the project
normalize() { # $1 = token, $2 = cwd (absolute)
  local t=$1 cwd=$2 out
  t=${t#\"}; t=${t%\"}; t=${t#\'}; t=${t%\'}
  case "$t" in
    /dev/null|/dev/stderr|/dev/stdout) echo dev; return ;;
    '$TMPDIR'*|'${TMPDIR'*|'$TMPDIR/'*) echo tmp; return ;;
    *'$'*) echo var; return ;;
  esac
  out=$(abspath "$t" "$cwd")
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

# Lex a Bash command the way the shell reads it. Output, one line per simple
# command: tokens joined by \037 (US), quotes removed and backslashes resolved,
# heredoc bodies dropped, `NAME=value` assignments from earlier in the command
# expanded into later tokens. A redirect target token carries a \036 (RS)
# prefix; input redirects and here-strings are dropped. Entering and leaving a
# subshell, `$(…)`, `>(…)` or backtick prints a line of just \035 (GS) `+` or
# `-`, so the caller can keep a cwd stack (`cd` inside one does not leak out).
lex() {
  awk '
  BEGIN { US = sprintf("%c", 31); RT = sprintf("%c", 30); GS = sprintf("%c", 29)
          RESERVED = "^(\\{|\\}|!|if|then|else|elif|fi|do|done|while|until|time|sudo|env|command|nohup|exec|builtin)$" }
  { buf = buf $0 "\n" }
  function expand(s,   out, p, rest, body, brace, nm, j, ch) {
    out = ""
    while ((p = index(s, "$")) > 0) {
      out = out substr(s, 1, p - 1); rest = substr(s, p + 1)
      brace = (substr(rest, 1, 1) == "{"); body = brace ? substr(rest, 2) : rest
      nm = ""; j = 1
      while (j <= length(body)) { ch = substr(body, j, 1); if (ch ~ /[A-Za-z0-9_]/) { nm = nm ch; j++ } else break }
      if (nm != "" && (nm in vars) && (!brace || substr(body, j, 1) == "}")) { out = out vars[nm]; s = substr(body, j + brace) }
      else { out = out "$"; s = rest }
    }
    return out s
  }
  function emit_word(partial,   t, nm) {
    if (!have) return
    t = tok; tok = ""; have = 0
    if (redir == 2) { redir = 0; return }                 # operand of < or <<<: not a write
    if (redir == 1) { redir = 0; t = RT expand(t) }
    else if (cmdpos == 0 && t ~ /^[A-Za-z_][A-Za-z0-9_]*=/) {
      nm = t; sub(/=.*/, "", nm)
      if (partial) delete vars[nm]; else vars[nm] = expand(substr(t, length(nm) + 2))
      t = expand(t)
    }
    else { t = expand(t); if (!(cmdpos == 0 && t ~ RESERVED)) cmdpos = 1 }
    gsub(/\n/, " ", t)
    line = started ? line US t : t; started = 1
  }
  function endcmd() { if (started) print line; line = ""; started = 0; cmdpos = 0 }
  function push(k, saved) { sp++; kind[sp] = k; sv[sp] = saved; print GS "+" }
  function pop() { state = sv[sp]; sp--; print GS "-" }
  function fdtok() { if (have && tok ~ /^[0-9]+$/) { tok = ""; have = 0 } else emit_word(0) }
  function read_delim(i, strip,   d, ch) {
    while (substr(buf, i, 1) ~ /[ \t]/) i++
    d = ""
    while (i <= n) {
      ch = substr(buf, i, 1)
      if (ch ~ /[ \t\n;|&<>()]/) break
      if (ch == "\\") { i++; ch = substr(buf, i, 1) }
      if (ch != "\"" && ch != "\047") d = d ch
      i++
    }
    hd[++nhd] = d; hdstrip[nhd] = strip
    return i
  }
  function skip_heredocs(i,   k, e, l) {
    for (k = 1; k <= nhd; k++) {
      while (i <= n) {
        e = index(substr(buf, i), "\n")
        if (e == 0) { l = substr(buf, i); i = n + 1 } else { l = substr(buf, i, e - 1); i += e }
        if (hdstrip[k]) sub(/^\t+/, "", l)
        if (l == hd[k]) break
      }
    }
    nhd = 0
    return i
  }
  END {
    n = length(buf); i = 1; state = "N"; sp = 0
    tok = ""; have = 0; redir = 0; line = ""; started = 0; cmdpos = 0; nhd = 0
    while (i <= n) {
      c = substr(buf, i, 1); c2 = substr(buf, i, 2)
      if (state == "S") { if (c == "\047") state = "N"; else tok = tok c; i++; continue }
      if (state == "D") {
        if (c == "\"") { state = "N"; i++; continue }
        if (c == "\\") {
          nx = substr(buf, i + 1, 1)
          if (nx == "\n") { i += 2; continue }
          if (nx == "\"" || nx == "$" || nx == "`" || nx == "\\") { tok = tok nx; i += 2; continue }
          tok = tok c; i++; continue
        }
        if (c2 == "$(") { emit_word(1); endcmd(); push("$(", "D"); state = "N"; i += 2; continue }
        if (c == "`") { emit_word(1); endcmd(); push("`", "D"); state = "N"; i++; continue }
        tok = tok c; i++; continue
      }
      # state N
      if (c == "\\") { nx = substr(buf, i + 1, 1); if (nx == "\n") { i += 2; continue } tok = tok nx; have = 1; i += 2; continue }
      if (c == "\047") { state = "S"; have = 1; i++; continue }
      if (c == "\"") { state = "D"; have = 1; i++; continue }
      if (c == "\n") { emit_word(0); endcmd(); i++; if (nhd > 0) i = skip_heredocs(i); continue }
      if (c == " " || c == "\t") { emit_word(0); i++; continue }
      if (c2 == "&&" || c2 == "||" || c2 == ";;" || c2 == "|&") { emit_word(0); endcmd(); i += 2; continue }
      if (c == ";" || c == "|") { emit_word(0); endcmd(); i++; continue }
      if (c2 == "$(" || c2 == "<(" || c2 == ">(") { emit_word(1); endcmd(); push("$(", "N"); i += 2; continue }
      if (c == "`") {
        emit_word(1); endcmd()
        if (sp > 0 && kind[sp] == "`") pop(); else push("`", "N")
        i++; continue
      }
      if (c == "(") { emit_word(0); endcmd(); push("(", "N"); i++; continue }
      if (c == ")") { emit_word(0); endcmd(); if (sp > 0) pop(); i++; continue }
      if (c2 == "&>") { fdtok(); i += 2; if (substr(buf, i, 1) == ">") i++; redir = 1; continue }
      if (c == "&") { emit_word(0); endcmd(); i++; continue }
      if (c == ">") {
        fdtok(); i++
        if (substr(buf, i, 1) == ">" || substr(buf, i, 1) == "|") i++
        if (substr(buf, i, 1) == "&") {
          i++
          if (substr(buf, i, 1) ~ /[0-9-]/) { while (substr(buf, i, 1) ~ /[0-9-]/) i++; continue }   # 2>&1, >&-
        }
        redir = 1; continue
      }
      if (c == "<") {
        fdtok(); i++
        if (substr(buf, i, 1) == ">") { i++; redir = 1; continue }                 # <> opens for writing
        if (substr(buf, i, 1) == "<") {
          i++
          if (substr(buf, i, 1) == "<") { i++; redir = 2; continue }                # <<< here-string
          strip = 0; if (substr(buf, i, 1) == "-") { strip = 1; i++ }
          i = read_delim(i, strip); continue                                        # << heredoc
        }
        if (substr(buf, i, 1) == "&") { i++; while (substr(buf, i, 1) ~ /[0-9-]/) i++; continue }
        redir = 2; continue
      }
      tok = tok c; have = 1; i++
    }
    emit_word(0); endcmd()
  }'
}

# --- standalone modes ---------------------------------------------------------
if [ "${1:-}" = "--classify" ]; then
  shift
  for p in "$@"; do echo "$(classify "$p" "$root") $p"; done
  exit 0
fi

readonly_tools='^[[:space:]]*(grep|rg|cat|head|tail|less|wc|diff|ls|find|stat|file|echo|printf|pwd|which|type|tree|du|jq|git (status|diff|log|show|rev-parse|blame|branch|ls-files|merge-base|rev-list|check-ignore|remote|describe))([[:space:]]|$)'
mutating='^(rm|mv|cp|touch|mkdir|tee|ln|chmod|chown|truncate|install|rmdir|patch|unzip|tar)$'
US=$(printf '\037'); RT=$(printf '\036'); GS=$(printf '\035')

check_bash() { # $1 = command, $2 = cwd; prints the first denial reason, or nothing
  local cmd=$1 cwd=$2 lexed
  # Read-only bypass: one line, one simple command, no ; & | > and no find -delete/-exec.
  if [ "$(printf '%s\n' "$cmd" | wc -l)" -eq 1 ] && ! printf '%s' "$cmd" | grep -q '[;&|>]' \
     && printf '%s' "$cmd" | grep -Eq "$readonly_tools" \
     && ! printf '%s' "$cmd" | grep -Eq -- '-(delete|exec|execdir|ok|fprint|fls)'; then return 0; fi
  lexed=$(printf '%s\n' "$cmd" | lex)
  # Protected literals anywhere in a non-read-only command (heredoc bodies excluded).
  if printf '%s' "$lexed" | tr "$US$RT" '  ' | grep -Eq '\.claude/(scope\.json|settings[^ ]*\.json)|scripts/hooks/|(^|[ /])\.git/'; then
    echo "the command names a protected file (.claude/scope.json, .claude/settings*.json, scripts/hooks/, .git/)"; return 0
  fi
  local simple first sub tok t gcwd cur=$cwd stack=() args=() toks=()
  printf '%s\n' "$lexed" | while IFS= read -r simple; do
    case "$simple" in
      "") continue ;;
      "$GS+") stack+=("$cur"); continue ;;
      "$GS-") if [ ${#stack[@]} -gt 0 ]; then cur=${stack[$((${#stack[@]} - 1))]}; unset "stack[$((${#stack[@]} - 1))]"; fi; continue ;;
    esac
    IFS=$US read -ra toks <<< "$simple"
    # Redirect targets are checked against the current directory; the rest are arguments.
    args=()
    for t in ${toks[@]+"${toks[@]}"}; do
      case "$t" in
        "$RT"*) tok=${t#?}; [ "$(classify "$tok" "$cur")" = ok ] || echo "DENY:redirect into $tok" ;;
        *) args+=("$t") ;;
      esac
    done
    # Drop assignment and reserved-word prefixes: `FOO=1 sudo env cmd`, `then rm x`, `{ rm x; }`.
    while [ ${#args[@]} -gt 0 ]; do
      case "${args[0]}" in
        '{'|'}'|'!'|if|then|else|elif|fi|do|done|while|until|time|sudo|env|command|nohup|exec|builtin) ;;
        *) printf '%s' "${args[0]}" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*=' || break ;;
      esac
      args=(${args[@]+"${args[@]:1}"})
    done
    [ ${#args[@]} -gt 0 ] || continue
    set -- "${args[@]}"
    first=$1; shift || true
    case "$first" in
      cd|pushd)
        tok=${1:-}
        case "$tok" in -*) tok=${2:-} ;; esac
        case "$tok" in ""|-) ;; *) case "$(normalize "$tok" "$cur")" in var) ;; *) cur=$(abspath "$tok" "$cur") ;; esac ;; esac ;;
      eval|xargs|sh|bash|zsh|source|.) echo "DENY:$first is not allowed in a scoped session; run the command directly with literal paths" ;;
      find) printf '%s\n' ${1+"$@"} | grep -Eq -- '^-(delete|exec|execdir|ok)$' && echo "DENY:find with -delete/-exec; delete with rm <path>" ;;
      sed|perl)
        printf '%s\n' ${1+"$@"} | grep -Eq '^-[a-zA-Z]*i' || continue
        for tok in ${1+"$@"}; do
          case "$tok" in ""|-*) continue ;; esac
          [ -e "$cur/$tok" ] || [ -e "$tok" ] || continue
          [ "$(classify "$tok" "$cur")" = ok ] || echo "DENY:in-place edit of $tok"
        done ;;
      git)
        gcwd=$cur   # git -C <dir>: paths in this command resolve against <dir>
        if [ "${1:-}" = "-C" ]; then
          [ "$(normalize "${2:-.}" "$cur")" = tmp ] || echo "DENY:git -C outside the temp dir"
          gcwd=$(abspath "${2:-.}" "$cur")
          shift 2 || true
        fi
        case "${1:-}" in
          --git-dir*|--work-tree*) echo "DENY:git --git-dir/--work-tree" ;;
          switch|rebase|merge|reset|cherry-pick|revert|am|stash|clean|worktree|filter-branch|filter-repo|update-ref|reflog)
            echo "DENY:git $1 rewrites or switches the tree; a scoped session keeps linear history on its branch (use git restore <path>)" ;;
          add)
            shift
            [ $# -gt 0 ] || echo "DENY:git add needs explicit paths"
            for tok in ${1+"$@"}; do
              case "$tok" in
                -A|--all|-u|--update|.|:/|:/*|-i|--interactive|-p|--patch) echo "DENY:git add $tok; stage the task's files by explicit path so each commit holds exactly one task" ;;
                -*) ;;
                *) [ "$(classify "$tok" "$gcwd")" = ok ] || echo "DENY:git add $tok" ;;
              esac
            done ;;
          rm|mv|restore|apply)
            sub=$1; shift
            for tok in ${1+"$@"}; do
              case "$tok" in -*|--) continue ;; esac
              [ "$(classify "$tok" "$gcwd")" = ok ] || echo "DENY:git $sub $tok"
            done ;;
          checkout)
            shift
            printf '%s\n' ${1+"$@"} | grep -qx -- '--' || echo "DENY:git checkout without -- (switching refs); use git restore -- <path> for files"
            for tok in ${1+"$@"}; do
              case "$tok" in -*|--) continue ;; esac
              [ "$(classify "$tok" "$gcwd")" = ok ] || echo "DENY:git checkout $tok"
            done ;;
          commit)
            printf '%s\n' ${1+"$@"} | grep -Eq '^(-a|--all|-[a-zA-Z]*a[a-zA-Z]*)$' \
              && echo "DENY:git commit -a; git add the task's files explicitly (one task per commit)" ;;
        esac ;;
      *)
        if printf '%s' "$first" | grep -Eq "$mutating"; then
          for tok in ${1+"$@"}; do
            case "$tok" in ""|-*|+*|[0-9]*) continue ;; esac
            [ "$(classify "$tok" "$cur")" = ok ] || echo "DENY:$first $tok"
          done
        fi ;;
    esac
  done | grep -m1 '^DENY:' | sed 's/^DENY://'
}

if [ "${1:-}" = "--check-bash" ]; then
  check_bash "$(cat)" "${2:-$root}"
  exit 0
fi

# --- hook mode ----------------------------------------------------------------
input=$(cat)
event=$(printf '%s' "$input" | jq -r '.hook_event_name // empty')
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
[ -n "$cwd" ] || cwd=$root

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
      why=$(check_bash "$command" "$cwd")
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
