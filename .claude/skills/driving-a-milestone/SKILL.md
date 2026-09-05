---
name: driving-a-milestone
description: Use when the owner asks to run, drive, or automate a roadmap milestone or phase end to end ("run milestone 0A", "drive phase 0", "do 0B without me opening sessions") in the human-gesture repo. Requires Herdr (HERDR_ENV=1) and the cris-managed-session skill.
---

# Driving a milestone

## Overview

This session becomes the **driver** for one milestone. It never writes code, plans, or docs. It spawns one worker Claude Code session per phase inside the milestone's worktree, hands it a self-contained brief, waits, reads the worker's `handoff.md`, and either continues, relays an owner question, or stops. The owner talks only to the driver, except to click a Claude Code dialog in a pane.

Driver plus one worker at a time **is** the "one session per milestone" of `CLAUDE.md §0` (`CLAUDE.md §6`). The driver's only repo writes: the STATUS claim (`scripts/milestone/claim`), the post-finish §8 row and STATUS-row removal (`scripts/milestone/log-decision --apply`, only on the owner's recorded approval), and, through the scripts, `session-*-brief.md` and `driver.json` under `docs/sdd/<M>/` (gitignored). The driver may read roadmap §3–6, §8 for the milestone row, and §9 for its re-plan triggers; a worker reads only what its brief names.

**Driver memory is on disk, not in this chat.** `docs/sdd/<M>/driver.json` (`scripts/milestone/driver-state <M> get`) holds pane, session `N`, role, base SHA, the loop step, the last wait result and outcome, nudges sent, and owner answers pending delivery. `claim`, `spawn`, `brief`, `wait`, `status` write it; the driver never edits it by hand except `driver-state <M> add answers '{"question":…,"answer":…}'`. Consequences: never keep a pane id, `N`, or an answer only in your head; never read `references/briefs.md` (`brief` fills it) or a `status-*.txt` dump unless a VERDICT line points at it; when this conversation grows long, say so and tell the owner it is safe to `/compact` or to open a fresh driver and say "resume <M>" (see **Resume**). A gate costs the same tokens whether it is the first or the tenth.

**Scope.** A worker can only write what its job needs. `spawn` derives a path allowlist from the role (and, for `execute`, from the next ≤2 unfinished tasks of the impl plan; `plan` may also create the contract tests under `*/test/contracts/`, which every later role is denied; `audit` may write only `handoff.md`) into the worktree's `.claude/scope.json`; `scripts/hooks/guard-scope.sh` denies every other Write/Edit and every mutating Bash command, and blocks after a Bash command that left out-of-scope changes. `spawn` records the base SHA; `status` prints the real diff and commits since it and flags `OUT-OF-SCOPE:` paths and `COMMIT-CHECK:` violations. The driver acts on those lines, never on the worker's self-report alone. The allowlist is never widened by hand: a legitimate extra path is a `NEEDS-OWNER` question (`path — reason`) and, if granted, an owner edit to the plan's `**Files:**` block followed by a fresh spawn.

## Preconditions (check in order, stop on the first failure)

1. `test "$HERDR_ENV" = 1`; `.claude/skills/cris-managed-session/scripts/create-session.sh` exists and is executable.
2. `git status --porcelain --untracked-files=no` is empty on the base branch (the branch PRs target; you are on it).
3. `docs/STATUS.md` has a row for `<M>` whose owner cell is `unclaimed` or `drv-<M>`.
4. `scripts/milestone/next --inputs <M>` prints one line: `READY: <M> — …` (exit 0) or `BLOCKED: <M> — …` (exit 1) with every item of the roadmap row's **Plan inputs** cell resolved (a milestone id → merged into the base branch or not; `G<n>` → its §8 row logged or `pending`; a doc → present; anything else → `OWNER`). `BLOCKED` → relay the line verbatim, stop; the owner logs §8, merges, or confirms the `OWNER` item and says proceed. Never resolve an input by reading the roadmap yourself.
5. `.claude/settings.local.json` exists in the root checkout with the owner's allowlist (git, pnpm, gh, tsc, vitest, playwright). Without it, every worker commit is a permission dialog; say so and let the owner decide before spawning.
6. `grep -q guard-scope.sh .claude/settings.json` succeeds and `scripts/hooks/guard-scope.sh` is executable. Without the hook the scope is only a request; stop and say so.
7. `grep -q require-handoff.sh .claude/settings.json` succeeds and `scripts/hooks/require-handoff.sh` is executable (the Stop hook that makes a worker finish its handoff after a cut connection). Without it a disconnect always ends at the owner; say so, the owner decides.
8. `docs/sdd/<M>/driver.json` already exists in the worktree → this is a **Resume**, not a start: skip to that section.

## Loop

```
claim ─► [plan] ─► [execute]* ─► [finish] ─► owner merges
            └──── NEEDS-OWNER: relay questions, send answers, same pane ────┘
```

Role order: `plan`, `execute` (repeat while `CONTINUE`), `finish`. Gate probes (0B–0E): `probe`, then `finish`. `audit` is never in the default order: the owner inserts it between two roles (see **Exit checks**). All scripts run from the root checkout or the worktree; both resolve the same paths.

1. **Claim.** `scripts/milestone/claim <M>` → `WORKTREE BRANCH BASE SLUG`. `SLUG` is the plan-file stem from the STATUS row (`0A-scaffold`). Also seeds `driver.json`.
2. **Spawn.** `scripts/milestone/spawn <M> <role>` → `PANE N BASE SCOPE`. It archives the previous `handoff.md` as `session-<N-1>-handoff.md` (keeping its `next` in `driver.json` for the brief), copies the local allowlist into the worktree, refuses a worktree with uncommitted tracked changes (exit 6: show the owner its output, they decide), writes `.claude/scope.json` (allowlist + base SHA), and records pane/`N`/role in `driver.json`. Every `WARN=` line it prints (a task without a `**Files:**` block, no impl plan yet, no unfinished task) goes to the owner verbatim before the brief; they say proceed or re-plan. Then `herdr agent wait <PANE> --until idle --timeout 60000`; `agent_not_found` in the first seconds is normal, retry once. A fresh worktree shows Claude Code's trust dialog (`blocked`; `herdr agent explain <PANE>` prints its text): tell the owner, they accept it in the pane (`herdr agent focus <PANE>`), re-run the wait. Never accept it for them.
3. **Brief.** `scripts/milestone/brief <M>` writes `docs/sdd/<M>/session-<N>-brief.md` from `references/briefs.md`: common header + role block, every `<…>` filled from `driver.json` and the roadmap, plus a "Previous answers" section when `driver.json` holds undelivered answers. A `WARN=` line on stderr (no roadmap heading names `<M>`) goes to the owner. Do not read the template or the brief; do not write a brief by hand.
4. **Send and wait.** `scripts/milestone/wait <M> --brief` in the background (`run_in_background`); it sends the one-line prompt, then waits through sleeps and socket drops (default deadline 90 min; `caffeinate` keeps the Mac from idle-sleeping meanwhile). Let its completion notification wake you; never poll with sleep. Act on its `RESULT=` line:

| `RESULT=` | driver does |
|---|---|
| `handoff` | step 5 |
| `blocked` | a Claude Code dialog in the pane: `herdr agent read <PANE> --lines 40`, show the owner, they answer in the pane (`herdr agent focus <PANE>`), then `scripts/milestone/wait <M>` again |
| `disconnect` | the worker's turn was cut by a network/API error (the lines are printed). Run `scripts/milestone/wait <M> --nudge` once; it tells the worker to re-read its brief and `progress.md` and continue. A second `disconnect` → `--nudge` again (the script refuses a third: `nudge-limit`); then tell the owner what the pane shows |
| `idle` | pane idle, no session-`N` handoff, no error text: the old "missing" case. `herdr agent read <PANE> --lines 60`, report what the worker was doing, ask the owner. Never infer an outcome |
| `stalled` | the prompt never started a turn: `herdr agent read <PANE> --lines 40`, show the owner (usually a dialog or a paste that did not submit) |
| `gone` | the pane died: step 2 with the same role; `brief` appends any undelivered answers itself |
| `deadline` | still working after the deadline: `herdr agent read <PANE> --lines 60`, the owner decides wait more (`scripts/milestone/wait <M>`) or stop |
| `transport` | Herdr unreachable after retries: tell the owner; when Herdr is back, `scripts/milestone/wait <M>` |

5. **Read.** `scripts/milestone/status <M>` prints a **VERDICT** block, the handoff verbatim, and an **attention** section; the full dump goes to `docs/sdd/<M>/status-<N>.txt` and is read only when a VERDICT line is not `ok`/`clean`/`none`. `HANDOFF=` must be `ok` (`mismatch` or `missing` → treat the handoff as missing: the `idle` row above). Then `SCOPE= COMMITS= HISTORY=`, before the outcome: any `OUT-OF-SCOPE:`, `COMMIT-CHECK:` or `HISTORY:` line in **attention** overrides the outcome and is handled as `NEEDS-OWNER`: relay the lines verbatim with the handoff's `summary`; the owner chooses revert, accept, or re-plan; their answer goes to the same pane as an answers message (the worker reverts and re-commits, or the owner amends the plan and you spawn afresh). Never revert, amend, or re-scope anything yourself. Then `EXIT=` / `LOCK=` and the exit-check rows in **attention** (see **Exit checks** below): act on the lock state and comparison words before the outcome table. Then `OUTCOME=`:

| outcome | driver does |
|---|---|
| `NEEDS-OWNER` | Put the questions to the owner verbatim (`AskUserQuestion` when they are choices). Record each answer: `scripts/milestone/driver-state <M> add answers '{"question":"…","answer":"…"}'`. Send the *answers* message from `references/briefs.md` (the one-line form quoted under **Messages** below) to the **same pane**: `scripts/milestone/wait <M> --answers "<message>"` in the background. Back to step 4's table. If the pane is gone, step 2: `brief` writes the "Previous answers" section from `driver.json`. A question of the form `path — reason` is a denied write: the owner's options are (a) add the path to the task's `**Files:**` block in `.impl.md` (or the probe plan) in the worktree themselves, then `stop-session.sh` and step 2 (spawn re-derives the scope); (b) tell the worker to do without; (c) re-plan. Never edit `.claude/scope.json`, the plan, or the hook for them. |
| `CONTINUE` | Read `exit-progress` in the handoff. Any `at risk` line → treat as `NEEDS-OWNER`: relay the line verbatim with the worker's reason, the owner decides whether to continue, re-plan, or stop. Else `stop-session.sh <PANE>`. Step 2 with the same role. |
| `DONE` | Check the role's artifacts against the `ARTIFACTS:` line (plan: `spec=yes impl=yes plan=yes exit-checks-table=yes ledger=yes`, then the **plan gate** under Exit checks; execute: `unfinished-tasks=0` **and** `exit-progress-lines` equal to the table rows with `at-risk=0`; finish: `pr-url=` set, or the owner has said they open the PR themselves). Short → treat as `BLOCKED`. An `at risk` line → treat as `NEEDS-OWNER` as above; a `not yet` line after execute → the owner chooses between another `execute` session and `finish`. Else `stop-session.sh <PANE>`, next role. After `finish`: `scripts/milestone/driver-state <M> set step finished`, report the PR URL and `evidence` to the owner, then step 7. |
| `BLOCKED` | `stop-session.sh <PANE>`. Report `summary`, `evidence`, `next` verbatim. Stop the loop. |

**Messages** (driver → same pane, always through `scripts/milestone/wait <M> --answers "…"` or `--prompt "…"`, never a bare `herdr agent prompt`): the answers message and the handoff-format message are quoted in `references/briefs.md`; `--brief` and `--nudge` compose their own. A worker prompt is always one line; everything else belongs in the brief.

6. **Re-plan check.** Before spawning the next role, read the roadmap §9 rows for this phase. A trigger that names `<M>` in its response and has fired (a gate result in `docs/spike-results.md`, an owner message, or an `exit-progress` line) → stop, report the row verbatim, the owner re-plans; never fold a §9 response into a brief yourself.

7. **Post-finish** (after finish `DONE`; `docs/tickets/0001`). Run `scripts/milestone/next <M>` from the root checkout and relay its lines verbatim, in this order:
   1. `STATE:` not merged → tell the owner the PR is theirs to merge, then stop; on "merged" (or a later "resume <M>"), `git pull --ff-only` in the root checkout and re-run `next <M>`. Never merge.
   2. `PROPOSED-8:` quote the block. `PROPOSED-8-ROW: ok` → run `scripts/milestone/log-decision <M>` (dry run) and show its `INSERT:` / `REPLACE:` / `KEEP:` / `STATUS-ROW:` lines and the `DIFF:`; `AskUserQuestion`: apply, or the owner edits by hand. Only on "apply": record it (`driver-state <M> add answers '{"question":"log-decision <M>","answer":"apply"}'`), then `scripts/milestone/log-decision <M> --apply` (one `[docs]` commit on the base branch: the §8 row, the covered `pending` rows removed, the STATUS row removed). `PROPOSED-8-ROW: none` → the owner writes the row by hand; say so, do not compose one.
   3. `READY:` / `BLOCKED:` lines and `summary:` → relay verbatim. A `READY` milestone is the owner's next "run <M>"; a `BLOCKED` line names what is missing (`pending (0D)`: that gate's milestone runs first; `(OWNER)`: the owner supplies it). Never start the next milestone on your own.

   The driver still writes nothing by hand: `log-decision --apply` is the one §8 / STATUS-row write, and only on the owner's recorded "apply".

## Resume (after compaction, a new driver session, or a laptop sleep)

The owner says "resume <M>", or precondition 8 found `driver.json`. Run preconditions 1, 5, 6, 7 only (the branch and the STATUS claim already exist). Then `scripts/milestone/driver-state <M> get` and branch on `step`:

| `step` | meaning | driver does |
|---|---|---|
| `claimed` | claim ran, nothing spawned | Loop step 2 with role `plan` (or `probe`) |
| `spawned` / `briefed` | a pane exists, the brief may not have been sent | `herdr agent get <pane>`: `working` → `scripts/milestone/wait <M>` (no flag); `idle` and no `session-<N>-brief.md` sent (`last_prompt` empty) → `scripts/milestone/wait <M> --brief`; `agent_not_found` → Loop step 2 same role |
| `waiting` | a prompt was sent, the wait was interrupted | `scripts/milestone/wait <M>` (no flag): it settles or classifies like step 4 |
| `gate` | the worker settled; `wait_result` / `last_outcome` say how far the reading got | `wait_result=handoff` → Loop step 5; any other `wait_result` → its row in step 4's table |
| `stopped` | the pane was closed after an outcome | `last_outcome=CONTINUE` → step 2 same role; `DONE` → step 2 next role (plan → check the lock is `FROZEN` first); `BLOCKED` → report and stop |
| `finished` | finish `DONE` was reported; §8 not logged yet | Loop step 7 (`next <M>`; `STATE:` decides whether `log-decision` may run) |
| `logged` | `log-decision --apply` ran | `scripts/milestone/next` (no `<M>`): relay the `READY:` / `BLOCKED:` lines, stop |

`driver-state <M> get answers` shows owner answers; `delivered: true` ones reached a worker. Never reconstruct state from this chat when `driver.json` disagrees; `driver.json` wins. If `driver.json` and `.claude/scope.json` disagree on `session`, stop and show the owner both.

After every `stop-session.sh <PANE>` run `scripts/milestone/driver-state <M> set step stopped` (the one hand write besides `add answers`).

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
`RESULT=blocked` mid-turn is a permission dialog: `herdr agent read <PANE> --lines 40`, show the owner, they answer in the pane, then `scripts/milestone/wait <M>` again. `stop-session.sh` is `.claude/skills/cris-managed-session/scripts/stop-session.sh`.

## Owner gates (stop and ask; never proxy the owner)

`BLOCKED` plan input (`next --inputs`) · brainstorm questions · a roadmap task whose verification cell names the owner · an ADR draft · any Claude Code dialog in a pane · PR merge · §8 entries and removing the STATUS row after merge (owner by hand, or `log-decision --apply` on the owner's recorded "apply"; never a hand edit by the driver) · the `## Exit checks` table and contract tests before `--freeze` · every `TAMPERED`, `DISAGREE`, `OWNER-CLAIM` line · spawning `audit` · starting the next milestone after a `READY:` line.

## Driving a phase

"Drive phase N" = the milestones of the roadmap phase section in dependency order (`0A` before `0B–0E`; `1A` before `1B–1E`). One milestone at a time by default. Independent milestones run in parallel only when the owner says so: each has its own worktree, pane, and background wait; never two workers on one milestone.

## Red flags

- Driver editing anything in the worktree by hand (briefs come from `brief`, state from `driver-state`).
- A worker prompt longer than one line (it belongs in the brief), or sent with a bare `herdr agent prompt` instead of `scripts/milestone/wait`.
- Reading `references/briefs.md` or a `status-*.txt` dump when no VERDICT line asked for it; keeping a pane id or `N` only in chat.
- Nudging a worker whose `RESULT` was `idle` (no error text): that is the owner's call, not a disconnect.
- Sending a third nudge, or answering a `disconnect` by re-spawning while the pane is alive.
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
- Merging. Owner only. Editing `§8` or removing the STATUS row by hand, or running `log-decision --apply` without the owner's recorded "apply".
- Composing a §8 row when `PROPOSED-8-ROW: none`, or resolving a plan input by reading the roadmap instead of `next --inputs`.
- Reporting finish `DONE` without step 7, or starting a `READY` milestone the owner has not asked for.
