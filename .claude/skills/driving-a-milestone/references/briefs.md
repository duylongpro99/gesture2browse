# Session briefs

Every brief = **common header** + one **role block** (+ **Previous answers** when resuming after a NEEDS-OWNER whose pane died). `<…>` is filled by the driver; `{…}` is written by the worker and stays as is. The worker reads the brief in one call and shares no history with the driver, so the brief must stand alone.

`scripts/milestone/brief <M>` assembles the brief from this file: `<WORKTREE> <BASE> <SLUG>` from `claim`, `<N> <role>` from `spawn`, `<section>` from the roadmap heading that names the milestone, the previous handoff's `next` and any undelivered owner answers from `driver.json`. The driver runs the script; it does not read this file or write a brief by hand. Keep the fenced blocks under `## Common header` and `## Role \`<role>\`` as the only templates, and keep every worker-side placeholder in `{…}`.

## Common header

```markdown
# Milestone <M> — session <N> — role <role>

You are the milestone session for **<M>** in worktree `<WORKTREE>`, branch `<M>`, base `<BASE>`. Plan files are `docs/plans/<SLUG>*.md`.
Start with `docs/STATUS.md`, then only what `CLAUDE.md §0` lists for this task, plus the roadmap row for <M> (`docs/05-roadmap.md §<section>`). `CLAUDE.md` and `.claude/rules/` win over every skill.

**Owner contact.** You cannot talk to the owner; a question typed in chat reaches nobody. When you need an owner decision (brainstorm questions included), batch every open question, write the handoff below with `outcome: NEEDS-OWNER`, and end your turn. The answers arrive as your next message; continue from there.

**Scope.** Your writes are limited to the paths in `.claude/scope.json` (read it once; `allow` globs, `deny` globs, and for `execute` the `tasks` you own). A hook denies everything else and blocks after a command that left changes outside them. A denial is not an obstacle to route around: if the task truly needs that path, stop and hand off `NEEDS-OWNER` with one `owner-questions` line per path, `path — reason`. Never edit `.claude/scope.json`, `.claude/settings*.json`, `scripts/hooks/`, the spec or the impl plan; `git add` explicit paths only; no `git stash`, `checkout <ref>`, `reset`, `rebase`.

**Commit before every handoff**, whatever the outcome. Every commit belongs to exactly one task: `git add {its paths}`, body first line `[{component}] task {N}: {task title}` (`[docs]` for the session-end writes, which are their own commit). The session-end commit stages exactly the files you rewrote: `docs/STATUS.md`, `docs/plans/<SLUG>.md`, `docs/journal/YYYY-MM-DD-<M>.md` (plus `docs/sdd/<M>/progress.md` or `docs/spike-results.md` when your role changed them). `docs/sdd/<M>/handoff.md` is gitignored, like every other `docs/sdd/<M>/` file except `progress.md`: never `git add` it (git refuses and aborts the rest of the line); the driver reads it from the worktree. Never `git push --force`, never merge, never edit roadmap §8.

**Handoff (required, every time you stop).** Write `docs/sdd/<M>/handoff.md` exactly:

    outcome: CONTINUE | NEEDS-OWNER | DONE | BLOCKED
    phase: <role>
    session: <N>
    summary: {one sentence: what changed}
    owner-questions:
    - {question, the options you see, your recommendation}
    evidence:
    - {command → result, PR URL, or failing output; one line each}
    exit-progress:
    - {one exit criterion of the roadmap row, verbatim} → met | not yet | at risk: {why, one clause}
    next: {one sentence: what the next session does first}

`owner-questions` only for NEEDS-OWNER; `evidence` only for DONE or BLOCKED; `exit-progress` required on CONTINUE and DONE, one line per criterion in the row's **Exit** cell plus one per item in **Interfaces fixed here** (an interface is "met" only when its downstream consumer named in the row could use it as is). Once `docs/plans/<SLUG>.md` has a `## Exit checks` table, each line quotes that table's **Criterion** cell verbatim (the driver joins on it) and a criterion is `met` only when its check passes in `scripts/milestone/exit-check <M> --fast`; before the table exists, quote the roadmap cells. `at risk` means the work so far satisfies the task but not the milestone; say why, do not fix it silently. Before a CONTINUE or DONE handoff also do the `CLAUDE.md §0` session-end writes: rewrite your `docs/STATUS.md` row and the plan `## Status`; add an entry to today's `docs/journal/YYYY-MM-DD-<M>.md`.

**Previous session said:** <previous handoff `next`, or "none: first session">
```

## Role `plan`

```markdown
## Goal
Produce `docs/plans/<SLUG>.spec.md`, `docs/plans/<SLUG>.impl.md`, `docs/plans/<SLUG>.md` (five-question form + `## Status`), then the SDD workspace.

## Steps
0. If any of the three files already exists, continue from the first missing one. Your scope is `docs/` plus the contract tests of step 5b under `{package}/test/contracts/`: no other code, no config; a task that needs code belongs in the `.impl.md`, not in this session. Every `.impl.md` task must carry a `**Files:**` block with exact `Create:`/`Modify:`/`Test:` paths; the next sessions' write scope is derived from it, so a missing or vague path becomes a denied write later.
1. Inputs: the roadmap row, its plan inputs in §8, `docs/02-architecture.md §3` and `§6`, `docs/plans/README.md`, any doc a task in the row names, and, for each item in **Interfaces fixed here**, the roadmap row of each consumer it names (their Plan scope, Task and Exit cells only). Nothing else from `docs/`.
2. If the row's task table has docs-only work verified by the owner before planning (e.g. 0A task 0.1), do it first, commit, hand off NEEDS-OWNER with a one-paragraph diff summary, and resume on approval. A task the repo already satisfies (e.g. `CLAUDE.md` exists): note it in `## Status`, move on.
3. `obra-brainstorming` → spec. Skip the visual companion. Spec questions go through NEEDS-OWNER handoffs, batched.
4. `obra-writing-plans` → `.impl.md`; header "Global Constraints" names the owning `.claude/rules/<component>.md` files.
5. Write `<SLUG>.md` answering the five questions; run the five-question checklist on `.impl.md`. A question you cannot answer → `BLOCKED`, the question in `summary`.
5b. Add `## Exit checks` to `<SLUG>.md` (form and rules: `docs/plans/README.md §Exit checks`): one `E` row per criterion in the row's **Exit** cell, one `I` row per item in **Interfaces fixed here**, Criterion verbatim, a command per row (`owner` where only the owner can verify). For each `I` row write the contract test its command names, from the consumer's side: what the consumer's roadmap row needs from the shape, asserted through the owning package's public export. It lives under `<owning package>/test/contracts/`, the only code path in your scope; it fails today; execute makes it pass and may not edit it. Commit. The driver shows the table and the tests to the owner before freezing them; a revision arrives as an answers message.
6. `scripts/sdd/sdd-workspace docs/plans/<SLUG>.impl.md` from the repo root. Commit. `outcome: DONE`.
```

## Role `execute`

```markdown
## Goal
Advance `docs/plans/<SLUG>.impl.md` with `obra-subagent-driven-development`.

## Steps
0. Re-read the roadmap row's **Exit** and **Interfaces fixed here** cells, the spec's goal section, and `## Exit checks` in `docs/plans/<SLUG>.md`. The task list serves those; they do not serve the task list. If the next unfinished task no longer moves an exit criterion, or would fix an interface in a shape its named consumer cannot use, do not complete it: hand off `NEEDS-OWNER` with the criterion, the conflict, and your recommendation. `## Exit checks` and the contract tests it names are frozen: never edit them (the scope hook denies `*/test/contracts/`), never add a test that shadows one; a check you believe wrong → `NEEDS-OWNER` with the row and why. Before your handoff run `scripts/milestone/exit-check <M> --fast` and grade `exit-progress` from it (`met` only on `PASS`; `at risk` stays your call).
1. Read `docs/sdd/<M>/progress.md` and the plan `## Status`; start at the first unfinished task.
2. Complete **at most 2 tasks** this session: the ones listed under `tasks` in `.claude/scope.json` (spec review, code review, boundary gate against the rule file). Files of any other task are denied. One commit per task (`[{component}] task {N}: …`); the SDD fix rounds of a task may add commits with the same task line. Then hand off `CONTINUE`, or `DONE` when no task remains. A file the task needs but the scope lacks → `NEEDS-OWNER`, `path — reason`; never restructure the task to avoid the path.
3. A task that needs a rule deviation: draft the ADR under `docs/adr/`, finish tasks that do not depend on it, hand off `NEEDS-OWNER` with the ADR path. Never merge the ADR yourself.
4. A task whose roadmap verification names the owner: do the agent-side verification, then `NEEDS-OWNER` with the exact steps the owner runs.
5. Threshold, filter, or gesture change: fixture replay is the failing test (`docs/plans/README.md §Superpowers`).
6. Ask via `NEEDS-OWNER` only for real decisions; routine calls are yours (`CLAUDE.md §1` five questions decide).
```

## Role `finish`

```markdown
## Goal
Close milestone <M>: verify, finish the branch, open the PR to `<BASE>`.

## Steps
1. `obra-verification-before-completion` = `CLAUDE.md §5` commands (tsc, lint, boundary check, unit tests, fixture replay if thresholds changed). When the row's exit says "from a clean clone", clone into `$TMPDIR` and run there. Then `scripts/milestone/exit-check <M>` (full; it clones for `clean-clone` rows) and put its `summary:` line in `evidence`. Any `FAIL` or `TAMPERED` → `BLOCKED` with the row and its tail lines; this role never fixes a failing check and never edits `## Exit checks` or a contract test.
2. `obra-finishing-a-development-branch`: check each exit criterion of the roadmap row, rewrite the STATUS row and plan `## Status`, list proposed §8 decisions under `## Status` as a paragraph headed `**Proposed decision(s) for roadmap §8 (owner logs; agent does not edit §8):**` whose first line after the heading is one complete §8 table row in a blockquote, `> | <YYYY-MM-DD> | <decision> | <input: the gate and milestone, e.g. G5 (0D): …> | <result> |` (`scripts/milestone/log-decision` applies exactly that row on the owner's approval; a bullet list cannot be applied), open a PR to `<BASE>` with `gh`. Never merge.
3. `outcome: DONE` with the PR URL and one `evidence` line per exit criterion; a failing check → `BLOCKED` with the failing output in `evidence`. Your scope holds no code paths: you cannot fix a check, and must not try.
```

## Role `probe` (gate milestones 0B–0E)

```markdown
## Goal
Run gate probe <M> (its roadmap §3.2 row): short plan, spike, agent-side verification, results into `docs/spike-results.md`.

## Steps
1. Inputs: the §3.2 row, plus the fixture format and bench CSV schema fixed in `docs/plans/0A-scaffold.md`.
2. Write `docs/plans/<SLUG>.md` (five questions; placement is the spike's owning component) with a `**Files:**` block of exact `Create:`/`Modify:`/`Test:` paths. Brainstorm only if a question is open; then NEEDS-OWNER. If this session's `.claude/scope.json` has no code paths (first probe session), commit the plan and hand off `CONTINUE`; the next session's scope is derived from your `**Files:**` block.
3. Implement with `obra-test-driven-development`; the row's agent verification is the test.
4. Record numbers in `docs/spike-results.md` under `<M>`; the owner-only check in the row's "Exit" cell → `NEEDS-OWNER` with the exact steps the owner runs.
5. On owner confirmation: proposed §8 decision under `## Status`, commit, `outcome: DONE`.
```

## Role `audit` (owner-invoked; inserted between two roles, changes nothing)

```markdown
## Goal
Grade milestone <M> against its frozen intent, independently of the sessions that built it: write your own `exit-progress`, one line per row of `## Exit checks`.

## Steps
0. Override of the common header: you change no file except `docs/sdd/<M>/handoff.md`. No commit, no STATUS row, no plan `## Status`, no journal entry. Do not read `docs/sdd/<M>/progress.md`, earlier handoffs, `docs/journal/`, or `docs/plans/<SLUG>.impl.md`: they are the builders' account, and you are here because that account needs a second reading.
1. Read, in this order: the roadmap row for <M> (`docs/05-roadmap.md §<section>`), `docs/plans/<SLUG>.spec.md` (goal and the five questions), `## Exit checks` in `docs/plans/<SLUG>.md`, the contract tests it names, then `git diff <BASE>...HEAD --stat` and the diff of whatever files each criterion depends on.
2. Run `scripts/milestone/exit-check <M>` (full). Its result per row is one input; the other is your reading of the diff against the criterion's text and, for `I` rows, against what the named consumer's roadmap row needs.
3. Handoff with `outcome: DONE`, `phase: audit`, `exit-progress` quoting each **Criterion** cell verbatim: `met` only when the check passes and the diff satisfies the criterion as written; `not yet` when work remains; `at risk` when the check passes but the criterion or the consumer would not be satisfied (say why, one clause: the file and the line that shows it). `summary`: one sentence on whether the built thing still matches the spec's goal. `evidence`: the exit-check `summary:` line. `next`: the role you were inserted before.
```

## Handoff-format message (driver → same pane, one line)

```
Your handoff's exit-progress does not join with `## Exit checks` in docs/plans/<SLUG>.md: <MISSING rows / UNMATCHED lines>. Rewrite docs/sdd/<M>/handoff.md with one line per table row, Criterion cell verbatim, grade met | not yet | at risk; change nothing else.
```

## Previous answers (append when resuming a NEEDS-OWNER in a new pane)

```markdown
## Previous answers
Session <N-1> asked (see its handoff, reproduced here) and the owner answered:
1. <question> → <answer>
```

## Answers message (driver → same pane, one line)

```
Owner answers to the questions in docs/sdd/<M>/handoff.md: (1) <answer>; (2) <answer>. Continue and rewrite handoff.md when you next stop.
```
