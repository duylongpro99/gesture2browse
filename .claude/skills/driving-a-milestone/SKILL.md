---
name: driving-a-milestone
description: Use when the owner asks to run, drive, or automate a roadmap milestone or phase end to end ("run milestone 0A", "drive phase 0", "do 0B without me opening sessions") in the human-gesture repo. Requires Herdr (HERDR_ENV=1) and the cris-managed-session skill.
---

# Driving a milestone

## Overview

This session becomes the **driver** for one milestone. It never writes code, plans, or docs. It spawns one worker Claude Code session per phase inside the milestone's worktree, hands it a self-contained brief, waits, reads the worker's `handoff.md`, and either continues, relays an owner question, or stops. The owner talks only to the driver, except to click a Claude Code dialog in a pane.

Driver plus one worker at a time **is** the "one session per milestone" of `CLAUDE.md §0` (`CLAUDE.md §6`). The driver's only repo writes: the STATUS claim (`scripts/milestone/claim`), and `session-*-brief.md` under `docs/sdd/<M>/` (gitignored). The driver may read roadmap §3–6, §8 for the milestone row, and §9 for its re-plan triggers; a worker reads only what its brief names.

**Scope.** A worker can only write what its job needs. `spawn` derives a path allowlist from the role (and, for `execute`, from the next ≤2 unfinished tasks of the impl plan; `plan` may also create the contract tests under `*/test/contracts/`, which every later role is denied; `audit` may write only `handoff.md`) into the worktree's `.claude/scope.json`; `scripts/hooks/guard-scope.sh` denies every other Write/Edit and every mutating Bash command, and blocks after a Bash command that left out-of-scope changes. `spawn` records the base SHA; `status` prints the real diff and commits since it and flags `OUT-OF-SCOPE:` paths and `COMMIT-CHECK:` violations. The driver acts on those lines, never on the worker's self-report alone. The allowlist is never widened by hand: a legitimate extra path is a `NEEDS-OWNER` question (`path — reason`) and, if granted, an owner edit to the plan's `**Files:**` block followed by a fresh spawn.

## Preconditions (check in order, stop on the first failure)

1. `test "$HERDR_ENV" = 1`; `.claude/skills/cris-managed-session/scripts/create-session.sh` exists and is executable.
2. `git status --porcelain --untracked-files=no` is empty on the base branch (the branch PRs target; you are on it).
3. `docs/STATUS.md` has a row for `<M>` whose owner cell is `unclaimed` or `drv-<M>`.
4. The roadmap row's **plan inputs**: every item that is a §8 decision row must not read `pending`. Items that name a doc count as present. A pending §8 input → name it, stop; the owner logs §8.
5. `.claude/settings.local.json` exists in the root checkout with the owner's allowlist (git, pnpm, gh, tsc, vitest, playwright). Without it, every worker commit is a permission dialog; say so and let the owner decide before spawning.
6. `grep -q guard-scope.sh .claude/settings.json` succeeds and `scripts/hooks/guard-scope.sh` is executable. Without the hook the scope is only a request; stop and say so.

## Loop

```
claim ─► [plan] ─► [execute]* ─► [finish] ─► owner merges
            └──── NEEDS-OWNER: relay questions, send answers, same pane ────┘
```

Role order: `plan`, `execute` (repeat while `CONTINUE`), `finish`. Gate probes (0B–0E): `probe`, then `finish`. `audit` is never in the default order: the owner inserts it between two roles (see **Exit checks**). All scripts run from the root checkout or the worktree; both resolve the same paths.

1. **Claim.** `scripts/milestone/claim <M>` → `WORKTREE BRANCH BASE SLUG`. `SLUG` is the plan-file stem from the STATUS row (`0A-scaffold`).
2. **Spawn.** `scripts/milestone/spawn <M> <role>` → `PANE N BASE SCOPE`. It deletes the previous `handoff.md`, copies the local allowlist into the worktree, refuses a worktree with uncommitted tracked changes (exit 6: show the owner its output, they decide), and writes `.claude/scope.json` (allowlist + base SHA). Every `WARN=` line it prints (a task without a `**Files:**` block, no impl plan yet, no unfinished task) goes to the owner verbatim before you write the brief; they say proceed or re-plan. Then `herdr agent wait <PANE> --until idle --timeout 60000`; `agent_not_found` in the first seconds is normal, retry once. A fresh worktree shows Claude Code's trust dialog (`blocked`; `herdr agent explain <PANE>` prints its text): tell the owner, they accept it in the pane (`herdr agent focus <PANE>`), re-run the wait. Never accept it for them.
3. **Brief.** Write `<WORKTREE>/docs/sdd/<M>/session-<N>-brief.md`: common header + role block from `references/briefs.md`, every `<…>` filled from step 1, the roadmap row, and the previous handoff's `next`. `{…}` fields are the worker's; leave them.
4. **Send.** `herdr agent prompt <PANE> "Read docs/sdd/<M>/session-<N>-brief.md and follow it exactly." --wait --timeout 5400000`, in the background. Let the completion notification wake you; never poll with sleep.
5. **Read.** `scripts/milestone/status <M>`. A handoff counts only if `session: <N>` matches (`status` prints `SESSION-MISMATCH:` when it does not); otherwise treat it as missing. Then the **scope check** section, before the outcome: any `OUT-OF-SCOPE:`, `COMMIT-CHECK:` or `HISTORY:` line overrides the outcome and is handled as `NEEDS-OWNER`: relay the lines verbatim with the handoff's `summary`; the owner chooses revert, accept, or re-plan; their answer goes to the same pane as an answers message (the worker reverts and re-commits, or the owner amends the plan and you spawn afresh). Never revert, amend, or re-scope anything yourself. Then the **exit checks** section (see **Exit checks** below): act on its `lock:` line and comparison words before the outcome table. Then:

| outcome | driver does |
|---|---|
| `NEEDS-OWNER` | Put the questions to the owner verbatim (`AskUserQuestion` when they are choices). Send the *answers* message from `references/briefs.md` to the **same pane** with `herdr agent prompt … --wait`. Back to step 5. If the pane is gone, step 2 with a new brief whose "Previous answers" section holds them. A question of the form `path — reason` is a denied write: the owner's options are (a) add the path to the task's `**Files:**` block in `.impl.md` (or the probe plan) in the worktree themselves, then `stop-session.sh` and step 2 (spawn re-derives the scope); (b) tell the worker to do without; (c) re-plan. Never edit `.claude/scope.json`, the plan, or the hook for them. |
| `CONTINUE` | Read `exit-progress`. Any `at risk` line → treat as `NEEDS-OWNER`: relay the line verbatim with the worker's reason, the owner decides whether to continue, re-plan, or stop. Else `stop-session.sh <PANE>`. Step 2 with the same role. |
| `DONE` | Check the role's artifacts in the `status` output (plan: `<SLUG>.spec.md`, `.impl.md`, `<SLUG>.md` with `## Exit checks`, `progress.md`, then the **plan gate** under Exit checks; execute: no unfinished task in `progress.md` **and** `exit-progress` has a line per Exit criterion and per fixed interface with none `at risk`; finish: a PR URL in `evidence`). Missing → treat as `BLOCKED`. An `at risk` line → treat as `NEEDS-OWNER` as above; a `not yet` line after execute → the owner chooses between another `execute` session and `finish`. Else `stop-session.sh <PANE>`, next role. After `finish`: report the PR URL and `evidence` to the owner, stop. |
| `BLOCKED` | `stop-session.sh <PANE>`. Report `summary`, `evidence`, `next` verbatim. Stop the loop. |
| missing | `herdr agent get <PANE>`: `working` → wait again (same timeout). Else `herdr agent read <PANE> --lines 60`, report what the worker was doing, ask the owner. Never infer an outcome. |

6. **Re-plan check.** Before spawning the next role, read the roadmap §9 rows for this phase. A trigger that names `<M>` in its response and has fired (a gate result in `docs/spike-results.md`, an owner message, or an `exit-progress` line) → stop, report the row verbatim, the owner re-plans; never fold a §9 response into a brief yourself.

## Exit checks (the driver compares, never grades)

The plan session turns the roadmap row's **Exit** and **Interfaces fixed here** cells into `## Exit checks` in `docs/plans/<SLUG>.md` (form: `docs/plans/README.md §Exit checks`): a command per criterion, a contract test written from the consumer's side per interface. Once the owner has approved and the driver has frozen it, that table and those tests hold the milestone's intent; the worker's `exit-progress` is one opinion about them, the script's run is the other. `scripts/milestone/exit-check <M>` prints, per row: the script's result (`PASS` / `FAIL` / `OWNER` / `REFUSED` / `TIMEOUT`), the worker's grade for the same criterion, and one comparison word. The driver acts on the printed words only.

**Plan gate** (on plan `DONE`, before `stop-session.sh`): (a) the report lists one `E` row per item of the Exit cell and one `I` row per item of Interfaces fixed here; each `I` row's `consumer:` names only milestones that cell names. Fewer rows, or `exit-check <M> --freeze` failing with "names no file" → treat as `BLOCKED` (the plan is incomplete). (b) Owner gate: show the table verbatim plus `git diff --stat <BASE>..HEAD -- <contract test paths>`; `AskUserQuestion`: approve, or change. A change goes to the same pane as an answers message; back to step 5. (c) On approval: `scripts/milestone/exit-check <M> --freeze` → `lock: FROZEN`. Then `stop-session.sh`, next role. Never spawn `execute` while the report says `lock: NONE`.

**Before spawning `finish`, and after finish `DONE`**: run the full `scripts/milestone/exit-check <M>` (clean-clone rows clone into `$TMPDIR`), not `--fast`; read it with the same table. Report its `summary:` line to the owner with the PR URL.

| report says | driver does |
|---|---|
| `lock: TAMPERED …` | `NEEDS-OWNER`: "The frozen exit checks changed since plan: <the lock line and the commits it lists>. Re-plan (roadmap §2.1, §7; the owner logs §8), or accept the change?" Only on "accept": `exit-check <M> --refreeze`. |
| every row `AGREE`, `OWNER (pending)` or `-`; no `AT-RISK`, `MISSING`, `UNMATCHED` | proceed per the outcome table (a `FAIL` + `not yet` after execute `DONE` is the existing "owner chooses execute or finish" rule) |
| `DISAGREE (worker says met, check fails)` | `NEEDS-OWNER`: "Worker reports `<criterion>` met; `<check>` fails: <the `\|` tail lines>. Another `execute` session on this criterion, an `audit` session, or stop and re-plan?" |
| `DISAGREE (check passes, worker says not yet)` | `NEEDS-OWNER`: "`<check>` passes but the worker says not yet: <worker line>. Keep the check as the criterion, or is the check weaker than the criterion (re-plan)?" |
| `AT-RISK` | `NEEDS-OWNER` as in the outcome table; include the script's result for that row. |
| `OWNER-CLAIM` | the worker marked an owner-verified criterion `met`: relay the worker's `evidence` line; the owner verifies. Never mark it yourself. |
| `MISSING` / `UNMATCHED` | malformed handoff: send the handoff-format message (`references/briefs.md`) to the same pane once, back to step 5; malformed again → treat as `BLOCKED`. |
| `REFUSED` / `TIMEOUT` | the check cannot run; report the row verbatim. A check changes only by re-plan; never edit the table. |

**Audit** (owner-invoked only: an answer to a `DISAGREE`, or "audit <M>"): spawn role `audit` between the current role and the next; it edits nothing and always hands off `DONE` with its own `exit-progress`. Compare its lines with the last worker handoff's lines row by row (both quote the Criterion cell): any row where the two grades differ, or where audit says `at risk` → `NEEDS-OWNER` with both lines and the script's result for that row. All equal → tell the owner "audit agrees", `stop-session.sh`, continue with the role the audit was inserted before. Never spawn `audit` on your own initiative.
Wait result `blocked` mid-turn is a permission dialog: `herdr agent read <PANE> --lines 40`, show the owner, they answer in the pane, then wait again. `stop-session.sh` is `.claude/skills/cris-managed-session/scripts/stop-session.sh`.

## Owner gates (stop and ask; never proxy the owner)

Pending §8 plan input · brainstorm questions · a roadmap task whose verification cell names the owner · an ADR draft · any Claude Code dialog in a pane · PR merge · §8 entries · removing the STATUS row after merge · the `## Exit checks` table and contract tests before `--freeze` · every `TAMPERED`, `DISAGREE`, `OWNER-CLAIM` line · spawning `audit`.

## Driving a phase

"Drive phase N" = the milestones of the roadmap phase section in dependency order (`0A` before `0B–0E`; `1A` before `1B–1E`). One milestone at a time by default. Independent milestones run in parallel only when the owner says so: each has its own worktree, pane, and background wait; never two workers on one milestone.

## Red flags

- Driver editing anything in the worktree except `session-*-brief.md`.
- A worker prompt longer than one line (it belongs in the brief).
- Answering a brainstorm question or a pane dialog yourself.
- Acting on a handoff whose `session:` is not this session's `N`.
- Moving past an `execute` handoff on `progress.md` alone, without reading `exit-progress`.
- Treating an `at risk` line as a task for the next worker instead of a question for the owner.
- Spawning `execute` while the report says `lock: NONE`; running `--refreeze` without the owner's "accept".
- Reading a `DISAGREE` and deciding yourself who is right (telling the next worker to "fix the test", or "fix the code").
- Editing `## Exit checks` or a contract test, or running `--fast` where the loop says full.
- Reopening a pane after `stop-session.sh` instead of writing a resume brief.
- Spawning the next role while `status` shows an `OUT-OF-SCOPE:`, `COMMIT-CHECK:` or `HISTORY:` line, or a `WARN=` line the owner has not seen.
- Editing `.claude/scope.json`, a `**Files:**` block, or `scripts/hooks/` to let a worker through. The owner widens a plan; nobody widens a scope.
- Merging, editing `§8`, removing the STATUS row. Owner only.
