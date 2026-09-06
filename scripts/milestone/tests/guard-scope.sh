#!/usr/bin/env bash
# Tests for scripts/hooks/guard-scope.sh's Bash-command parser against a fixture
# project built in $TMPDIR (docs/tickets/0003). Run from anywhere:
#   scripts/milestone/tests/guard-scope.sh
# Each `allow` case is a command a Phase 0 worker actually ran and the old
# parser denied (quoted `>`, `)` after /dev/null, cd in the same line, $VAR
# assigned in the same line); each `deny` case is a rule that must survive.
set -euo pipefail
hook=$(cd "$(dirname "$0")/../../hooks" && pwd)/guard-scope.sh
# Two temp dirs: the project and, elsewhere, the session scratchpad. A sibling of
# the project is out of scope by design (the root checkout, other worktrees),
# so the scratchpad must not be one. TMPDIR often ends in `/`, so the paths
# carry a `//`: the hook must compare canonical paths.
work=$(mktemp -d "${TMPDIR:-/tmp}/guard-scope-test.XXXXXX"); scratch=$(mktemp -d "${TMPDIR:-/tmp}/guard-scope-scratch.XXXXXX")
[ "${KEEP_WORK:-}" = 1 ] && echo "work=$work scratch=$scratch" || trap 'rm -rf "$work" "$scratch"' EXIT
proj="$work/proj"; mkdir -p "$proj/.claude" "$proj/apps/playground/src" "$proj/fixtures/dispatch" "$proj/docs/sdd/0X" "$proj/docs/plans" "$proj/packages/core/test/contracts"
cat > "$proj/.claude/scope.json" <<'EOF'
{"milestone":"0X","role":"probe","base":"0000000",
 "allow":["docs/STATUS.md","docs/journal/**","docs/sdd/0X/**","docs/plans/0X-*.md","docs/spike-results.md","apps/playground/**","fixtures/**"],
 "deny":[".claude/scope.json",".claude/settings*.json","scripts/hooks/**","docs/05-roadmap.md","*/test/contracts/**"]}
EOF
touch "$proj/apps/playground/src/a.ts" "$proj/docs/plans/other.md"
export CLAUDE_PROJECT_DIR=$proj
fail=0; n=0; out="$work/out"
run() { printf '%s' "$1" | "$hook" --check-bash "${2:-$proj}" > "$out" 2>&1 || true; }
allow() { # $1 = name, $2 = command, [$3 = cwd]
  n=$((n + 1)); run "$2" "${3:-}"
  if [ ! -s "$out" ]; then echo "ok $n - allow: $1"; else echo "not ok $n - allow: $1"; fail=1; sed 's/^/    | denied: /' "$out"; fi
}
deny() { # $1 = name, $2 = command, $3 = expected reason fragment, [$4 = cwd]
  n=$((n + 1)); run "$2" "${4:-}"
  if grep -Fq -- "$3" "$out"; then echo "ok $n - deny: $1"; else echo "not ok $n - deny: $1 (want '$3')"; fail=1; sed 's/^/    | got: /' "$out"; fi
}

# --- allow: false positives from the Phase 0 transcripts -----------------------
allow 'commit message with <-> and >' 'git add apps/playground/src/a.ts && git commit -q -m "[core] task 3: FSM
skeleton (Paused<->Armed clutch, fist-motion Scroll), and -> replayFixture.

Co-Authored-By: X <x@example.com>" && git log --oneline -1'
allow 'grep pattern with >= in double quotes' 'pnpm exec playwright test frame-pump 2>&1 | grep -E "G1|passed|failed|>=" | head -25'
allow 'grep pattern with > in single quotes' "grep -n 'Proposed\\|^\\s*>\\||' docs/plans/other.md 2>/dev/null | head -30; echo \"---\"; file docs/plans/other.md"
allow 'node -e with arrow functions and braces' "node -e '
const rx = { video: /\\b(VideoFrame)\\b/ };
const t = (name, s, want) => { const got = rx[name].test(s); console.log(got===want?\"ok\":\"FAIL\"); };
t(\"video\",\"x\",true);
'"
allow 'node -e in double quotes with => and 2>&1' "curl -s https://example.invalid | node -e \"let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(d)})\" 2>&1 | tail -2"
allow '2>/dev/null inside $( )' 'for p in a b; do v=$(curl -s "https://registry.npmjs.org/$p/latest" | python3 -c "import sys,json;print(json.load(sys.stdin)[\"version\"])" 2>/dev/null); echo "$p -> $v"; done'
allow 'echo "exit=$?" and -> in echo' 'node lint.mjs; echo "exit=$?"; echo "a -> b"'
allow 'cd to scratchpad then relative redirect' "cd $scratch && printf 'export const x = 41;\\n' > lib.ts && node lib.ts 2>&1 | tail -5"
allow 'cd into in-scope dir then relative redirects and rm' "cd $proj/apps/playground && printf 'x' > src/__tmp_lib.ts && node src/__tmp_lib.ts 2>&1 | tail -3 ; rm -f src/__tmp_lib.ts"
allow 'cd then heredocs into in-scope dir, body has > and rm' "cd $proj/fixtures/dispatch

cat > button-onclick.html <<'EOF'
<!doctype html>
<button data-dispatch-target>Click me</button>
<script>rm -rf / > /etc/passwd; a -> b</script>
EOF

cat > anchor-href.html <<'EOF'
<a href=\"#dispatched\">follow</a>
EOF

echo \"batch 1 written\"; ls"
allow 'variable assigned in the same command' "SP=\"$scratch\"; mkdir -p \"\$SP/apps/x\"; printf 'y' > \"\$SP/apps/x/bad.ts\"; cd \"\$SP\" && node x.mjs; echo \"exit=\$?\""
allow 'commit -F - with heredoc message' "git add docs/sdd/0X/progress.md && git commit -q -F - <<'EOF'
[docs] 0X session 2: DONE handoff — PR #3 to master

Co-Authored-By: X <x@example.com>
EOF
git push -q origin 0X 2>&1 | tail -3; echo \"pushed\""
allow 'commit -m "$(cat <<EOF ...)" with && after' 'git add docs/plans/0X-plan.md && git commit -q -m "$(cat <<'"'"'EOF'"'"'
[docs] task 0: plan — five questions

Co-Authored-By: X <x@example.com>
EOF
)" && git log --oneline -1'
allow 'in-scope redirect, plain' 'printf "x" > apps/playground/src/new.ts'
allow 'redirect to /dev/null and stderr dup' 'pnpm test > /dev/null 2>&1; ls >&2'
allow 'tee into scratch inside subshell' "(cd $scratch && echo hi | tee log.txt)"
allow 'backslash-escaped > is text' 'echo a \> b'
allow 'here-string is not a write' 'grep -c x <<< "a > b"'
allow 'input redirect is not a write' 'wc -l < docs/05-roadmap.md'
allow 'read-only single command bypass' 'grep -rn "confirm(" apps/'
allow 'git -C in temp dir' "git -C $scratch status --short && git -C $scratch add x.txt"

# --- deny: rules that must survive the rewrite -------------------------------
deny 'redirect out of scope' 'echo x > docs/plans/other.md' 'redirect into docs/plans/other.md'
deny 'redirect out of scope after cd' "cd $proj/apps/playground && echo x > ../../docs/plans/other.md" 'redirect into ../../docs/plans/other.md'
deny 'cd inside subshell does not leak (would be tmp otherwise)' "(cd $scratch) && rm -f docs/plans/other.md" 'rm docs/plans/other.md'
deny 'sibling of the project is out (root checkout, other worktrees)' "echo x > $proj/../other/f.txt" 'redirect into'
deny 'cd inside $( ) does not leak' "x=\$(cd $scratch && ls) ; rm -f docs/plans/other.md" 'rm docs/plans/other.md'
deny 'heredoc into out-of-scope path' "cat > docs/plans/other.md <<'EOF'
x
EOF" 'redirect into docs/plans/other.md'
deny 'rm out of scope' 'rm -rf packages/core' 'rm packages/core'
deny 'deny glob beats allow (contract tests)' 'touch packages/core/test/contracts/a.test.ts' 'touch packages/core/test/contracts/a.test.ts'
deny 'redirect to absolute outside' 'echo x > /etc/passwd' 'redirect into /etc/passwd'
deny 'unresolvable $VAR redirect' 'echo x > "$OUT/file"' 'redirect into $OUT/file'
deny 'reserved word then rm' 'if [ -f x ]; then rm docs/plans/other.md; fi' 'rm docs/plans/other.md'
deny 'brace group rm' '{ rm docs/plans/other.md; }' 'rm docs/plans/other.md'
deny 'assignment prefix then rm' 'FOO=1 sudo rm docs/plans/other.md' 'rm docs/plans/other.md'
deny 'git add -A' 'git add -A && git commit -m x' 'git add -A'
deny 'git add .' 'git add . ' 'git add .'
deny 'git add out of scope' 'git add docs/05-roadmap.md' 'git add docs/05-roadmap.md'
deny 'git commit -a' 'git commit -am "x"' 'git commit -a'
deny 'git commit -a not fooled by message' 'git commit -a -m "not -a"' 'git commit -a'
deny 'git reset' 'git reset --hard HEAD~1' 'git reset'
deny 'git checkout ref' 'git checkout master' 'git checkout without --'
deny 'git -C outside temp' "git -C $proj/../other status" 'git -C outside'
deny 'eval' 'eval "rm x"' 'eval is not allowed'
deny 'bash -c' 'bash -c "rm docs/plans/other.md"' 'bash is not allowed'
deny 'find -delete' 'find fixtures -name "*.tmp" -delete' 'find with -delete'
deny 'sed -i out of scope' 'sed -i "" "s/a/b/" docs/plans/other.md' 'in-place edit of docs/plans/other.md'
deny 'protected literal' 'cat scripts/hooks/guard-scope.sh > docs/sdd/0X/x.txt' 'protected file'
deny 'protected literal in quotes' 'echo "see .claude/scope.json" > docs/sdd/0X/x.txt' 'protected file'
deny 'write inside $( ) out of scope' 'echo "$(echo x > docs/plans/other.md)"' 'redirect into docs/plans/other.md'
deny 'mkdir out of scope via $VAR resolved' "D=$proj/docs; mkdir -p \"\$D/new\"" "mkdir $proj/docs/new"
deny 'mv out of scope' 'mv apps/playground/src/a.ts docs/plans/a.ts' 'mv docs/plans/a.ts'
deny 'redirect with &>' 'pnpm test &> docs/plans/log.txt' 'redirect into docs/plans/log.txt'
deny 'redirect with 2>' 'pnpm test 2> docs/plans/log.txt' 'redirect into docs/plans/log.txt'

# --- hook JSON mode and --classify ----------------------------------------------
n=$((n + 1)); r=$(jq -n --arg c "echo x > docs/plans/other.md" --arg cwd "$proj" '{hook_event_name:"PreToolUse",tool_name:"Bash",cwd:$cwd,tool_input:{command:$c}}' | "$hook")
if printf '%s' "$r" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null && printf '%s' "$r" | grep -q 'redirect into docs/plans/other.md'; then echo "ok $n - hook JSON: Bash deny"; else echo "not ok $n - hook JSON: Bash deny"; fail=1; echo "    | $r"; fi
n=$((n + 1)); r=$(jq -n --arg c 'git commit -m "a -> b"' --arg cwd "$proj" '{hook_event_name:"PreToolUse",tool_name:"Bash",cwd:$cwd,tool_input:{command:$c}}' | "$hook")
if [ -z "$r" ]; then echo "ok $n - hook JSON: Bash allow prints nothing"; else echo "not ok $n - hook JSON: Bash allow prints nothing"; fail=1; echo "    | $r"; fi
n=$((n + 1)); r=$(jq -n --arg f "$proj/docs/plans/other.md" --arg cwd "$proj" '{hook_event_name:"PreToolUse",tool_name:"Write",cwd:$cwd,tool_input:{file_path:$f}}' | "$hook")
if printf '%s' "$r" | jq -e '.hookSpecificOutput.permissionDecision == "deny"' >/dev/null; then echo "ok $n - hook JSON: Write deny"; else echo "not ok $n - hook JSON: Write deny"; fail=1; echo "    | $r"; fi
n=$((n + 1)); r=$(jq -n --arg f "$proj/docs/sdd/0X/handoff.md" --arg cwd "$proj" '{hook_event_name:"PreToolUse",tool_name:"Write",cwd:$cwd,tool_input:{file_path:$f}}' | "$hook")
if [ -z "$r" ]; then echo "ok $n - hook JSON: Write allow"; else echo "not ok $n - hook JSON: Write allow"; fail=1; echo "    | $r"; fi
n=$((n + 1)); r=$("$hook" --classify docs/sdd/0X/handoff.md docs/05-roadmap.md "$proj/fixtures/x" /etc/hosts)
if [ "$r" = "ok docs/sdd/0X/handoff.md
deny docs/05-roadmap.md
ok $proj/fixtures/x
deny /etc/hosts" ]; then echo "ok $n - --classify"; else echo "not ok $n - --classify"; fail=1; printf '%s\n' "$r" | sed 's/^/    | /'; fi

echo "# $n tests, fail=$fail"
exit $fail
