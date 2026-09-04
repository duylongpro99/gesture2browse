# Session briefs

Every brief = **common header** + one **role block** (+ **Previous answers** when resuming after a NEEDS-OWNER whose pane died). `<…>` is filled by the driver; `{…}` is written by the worker and stays as is. The worker reads the brief in one call and shares no history with the driver, so the brief must stand alone.

Driver inputs: `WORKTREE BRANCH BASE SLUG` from `claim`; `N` from `spawn`; the roadmap row (`docs/05-roadmap.md`, section number of the milestone); the previous handoff's `next`.

## Common header

```markdown
# Milestone <M> — session <N> — role <role>

You are the milestone session for **<M>** in worktree `<WORKTREE>`, branch `<M>`, base `<BASE>`. Plan files are `docs/plans/<SLUG>*.md`.
Start with `docs/STATUS.md`, then only what `CLAUDE.md §0` lists for this task, plus the roadmap row for <M> (`docs/05-roadmap.md §<section>`). `CLAUDE.md` and `.claude/rules/` win over every skill.

**Owner contact.** You cannot talk to the owner; a question typed in chat reaches nobody. When you need an owner decision (brainstorm questions included), batch every open question, write the handoff below with `outcome: NEEDS-OWNER`, and end your turn. The answers arrive as your next message; continue from there.

**Commit before every handoff**, whatever the outcome, with a `[<component>]` first body line (`[docs]` for docs-only work). Never `git push --force`, never merge, never edit roadmap §8.

**Handoff (required, every time you stop).** Write `docs/sdd/<M>/handoff.md` exactly:

    outcome: CONTINUE | NEEDS-OWNER | DONE | BLOCKED
    phase: <role>
    session: <N>
    summary: {one sentence: what changed}
    owner-questions:
    - {question, the options you see, your recommendation}
    evidence:
    - {command → result, PR URL, or failing output; one line each}
    next: {one sentence: what the next session does first}

`owner-questions` only for NEEDS-OWNER; `evidence` only for DONE or BLOCKED. Before a CONTINUE or DONE handoff also do the `CLAUDE.md §0` session-end writes: rewrite your `docs/STATUS.md` row and the plan `## Status`; add an entry to today's `docs/journal/YYYY-MM-DD-<M>.md`.

**Previous session said:** <previous handoff `next`, or "none: first session">
```

## Role `plan`

```markdown
## Goal
Produce `docs/plans/<SLUG>.spec.md`, `docs/plans/<SLUG>.impl.md`, `docs/plans/<SLUG>.md` (five-question form + `## Status`), then the SDD workspace.

## Steps
0. If any of the three files already exists, continue from the first missing one.
1. Inputs: the roadmap row, its plan inputs in §8, `docs/02-architecture.md §3` and `§6`, `docs/plans/README.md`, and any doc a task in the row names. Nothing else from `docs/`.
2. If the row's task table has docs-only work verified by the owner before planning (e.g. 0A task 0.1), do it first, commit, hand off NEEDS-OWNER with a one-paragraph diff summary, and resume on approval. A task the repo already satisfies (e.g. `CLAUDE.md` exists): note it in `## Status`, move on.
3. `obra-brainstorming` → spec. Skip the visual companion. Spec questions go through NEEDS-OWNER handoffs, batched.
4. `obra-writing-plans` → `.impl.md`; header "Global Constraints" names the owning `.claude/rules/<component>.md` files.
5. Write `<SLUG>.md` answering the five questions; run the five-question checklist on `.impl.md`. A question you cannot answer → `BLOCKED`, the question in `summary`.
6. `scripts/sdd/sdd-workspace docs/plans/<SLUG>.impl.md` from the repo root. Commit. `outcome: DONE`.
```

## Role `execute`

```markdown
## Goal
Advance `docs/plans/<SLUG>.impl.md` with `obra-subagent-driven-development`.

## Steps
1. Read `docs/sdd/<M>/progress.md` and the plan `## Status`; start at the first unfinished task.
2. Complete **at most 2 tasks** this session (spec review, code review, boundary gate against the rule file). Then hand off `CONTINUE`, or `DONE` when no task remains.
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
1. `obra-verification-before-completion` = `CLAUDE.md §5` commands (tsc, lint, boundary check, unit tests, fixture replay if thresholds changed). When the row's exit says "from a clean clone", clone into `$TMPDIR` and run there.
2. `obra-finishing-a-development-branch`: check each exit criterion of the roadmap row, rewrite the STATUS row and plan `## Status`, list proposed §8 decisions under `## Status`, open a PR to `<BASE>` with `gh`. Never merge.
3. `outcome: DONE` with the PR URL and one `evidence` line per exit criterion; a failing check → `BLOCKED` with the failing output in `evidence`.
```

## Role `probe` (gate milestones 0B–0E)

```markdown
## Goal
Run gate probe <M> (its roadmap §3.2 row): short plan, spike, agent-side verification, results into `docs/spike-results.md`.

## Steps
1. Inputs: the §3.2 row, plus the fixture format and bench CSV schema fixed in `docs/plans/0A-scaffold.md`.
2. Write `docs/plans/<SLUG>.md` (five questions; placement is the spike's owning component). Brainstorm only if a question is open; then NEEDS-OWNER.
3. Implement with `obra-test-driven-development`; the row's agent verification is the test.
4. Record numbers in `docs/spike-results.md` under `<M>`; the owner-only check in the row's "Exit" cell → `NEEDS-OWNER` with the exact steps the owner runs.
5. On owner confirmation: proposed §8 decision under `## Status`, commit, `outcome: DONE`.
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
