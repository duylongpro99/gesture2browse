# 0003 — guard-scope.sh: parse Bash the way the shell does, so a quoted `>` is not a redirect

**Status:** implemented 2026-09-06 (`scripts/hooks/guard-scope.sh` lexer rewrite; tests in `scripts/milestone/tests/guard-scope.sh`, 58 cases) — awaiting owner review
**Opened:** 2026-09-06 (remedy ticket from 0002 §Approval (d), S2 chain 2)
**Component:** `scripts/hooks/guard-scope.sh` (Bash branch of PreToolUse). No change to `scripts/milestone/`, the skill, or the scope shape.
**Priority:** enhancement (removes a recurring worker retry chain; not blocking Phase 1)

## Problem

The hook found redirect targets with a regex over the raw command text and split simple commands on `&&`/`;`/`|` with `gsub`. Neither knew about quotes, so text inside a string was read as shell syntax. Every occurrence below is a worker command that was correct and got denied, then rewritten until it passed (transcripts, Phase 0; the ticket 0002 table counted 7 of the first three shapes across 0A 0B 0D 0E; the full replay of all 36 guard-scope denials found 21 false positives):

| denial text | cause | example |
|---|---|---|
| `redirect into "` · `redirect into Armed` · `redirect into \` | `>` inside a commit message or grep pattern (`Paused<->Armed`, `'^\s*>\|'`) | `git commit -m "… Paused<->Armed …"` |
| `redirect into {` · `redirect into d+=c).on('end',()=` | `=>` / `> {` inside `node -e '…'` source | `node -e 'const t = (a) => { … }'` |
| `redirect into ="` | `>=` inside a double-quoted grep alternation | `grep -E "G1\|passed\|>="` |
| `redirect into /dev/null)` · `redirect into $v"` | `)` glued to the target inside `$(… 2>/dev/null)`; `->` in `echo "$p -> $v"` | `v=$(curl … 2>/dev/null); echo "$p -> $v"` |
| `redirect into lib.ts` · `redirect into button-onclick.html` | relative path after a `cd` earlier in the same line, resolved against the hook's cwd | `cd <scratchpad> && printf … > lib.ts` |
| `redirect into "$SP/…"` · `rm "$SP"` | `$SP` assigned earlier in the same line | `SP="/private/tmp/…"; mkdir -p "$SP/x"` |
| `git add \` | backslash-newline continuation read as a path | `git add \`⏎`  package.json …` |

The rewrites that passed dropped quotes, heredocs, `$(…)` or the `cd`, so the retry cost a turn and sometimes made the command worse (a commit message split across `-m` flags).

## Fix (ticket 0002 §4 remedy 1: fix the tool so A stops failing)

`check_bash` now lexes the command with a small awk state machine that mirrors the shell's reader, then checks each simple command:

- single quotes, double quotes and backslashes are resolved; a `>` inside them is text;
- `;` `&&` `||` `|` `|&` `&` and newlines split simple commands; `$(…)`, `(…)`, `<(…)`/`>(…)` and backticks open nested commands, so `2>/dev/null)` yields the target `/dev/null`;
- heredoc bodies (`<<EOF`, `<<-EOF`, `<<'EOF'`, several per line) are dropped; here-strings and `<` inputs are not writes;
- redirect operators `>` `>>` `>|` `&>` `&>>` `<>` `N>` mark the next word as a write target; `2>&1`, `>&2`, `>&-` are fd dups, not targets;
- `cd`/`pushd` moves the working directory for the rest of the line, with a stack so a `cd` inside `(…)` or `$(…)` does not leak; `git -C <dir>` resolves that command's paths against `<dir>`;
- `NAME=value` assigned earlier in the same command is substituted into later `$NAME`/`${NAME}`; `${NAME:-x}` and unknown names stay unresolved and still deny;
- leading `FOO=1`, `sudo`, `env`, `time`, `then`, `do`, `{`, `!` … are stripped before the command word is read, so `if …; then rm x; fi` and `{ rm x; }` are checked (the old splitter saw `then` and `{` as the command and let them through);
- `CLAUDE_PROJECT_DIR` is canonicalised (`//`, `/./`) before comparison.

Every deny rule is unchanged: out-of-scope redirect targets and mutating-command arguments, `git add -A|.|-u`, `git commit -a`, `git reset|rebase|…`, `git checkout` without `--`, `git -C` outside the temp dir, `eval|xargs|sh -c|bash -c`, `find -delete|-exec`, `sed|perl -i`, the protected literals, and the PostToolUse tree check. The `--classify` interface used by `scripts/milestone/status` is unchanged. A `--check-bash` mode (command on stdin, reason on stdout) exists for the tests.

## Verification

- `scripts/milestone/tests/guard-scope.sh`: 58 cases, all green — 21 `allow` cases are the transcript commands above, 31 `deny` cases pin the rules, plus hook-JSON and `--classify` round trips.
- Replay of all 36 historical guard-scope denials (Phase 0 transcripts) through the new parser: the 21 parser false positives are now allowed; the 15 real denials (reset, `add -A`, xargs, protected files, out-of-scope `git add`) still fire with the same text.
- `scripts/milestone/tests/post-finish.sh` still 37/37.

## Not done (out of this ticket)

- `guard-scope.sh` is not a full shell parser: `"pre$(cmd)post"` becomes two tokens, and a redirect target built from a `${VAR:-default}` or `$(…)` still denies as `var`. Both deny, never allow, so the failure mode is a `NEEDS-OWNER` handoff, not an escape.
