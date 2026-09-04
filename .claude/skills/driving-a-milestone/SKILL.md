---
name: driving-a-milestone
description: Use when the owner asks to run, drive, or automate a roadmap milestone or phase end to end ("run milestone 0A", "drive phase 0", "do 0B without me opening sessions") in the human-gesture repo. Requires Herdr (HERDR_ENV=1) and the cris-managed-session skill.
---

# Driving a milestone

## Overview

This session becomes the **driver** for one milestone. It never writes code, plans, or docs. It spawns one worker Claude Code session per phase inside the milestone's worktree, hands it a self-contained brief, waits, reads the worker's `handoff.md`, and either continues, relays an owner question, or stops. The owner talks only to the driver, except to click a Claude Code dialog in a pane.

Driver plus one worker at a time **is** the "one session per milestone" of `CLAUDE.md §0` (`CLAUDE.md §6`). The driver's only repo writes: the STATUS claim (`scripts/milestone/claim`), and `session-*-brief.md` under `docs/sdd/<M>/` (gitignored). The driver may read roadmap §3–6 and §8 for the milestone row; a worker reads only what its brief names.

## Preconditions (check in order, stop on the first failure)

1. `test "$HERDR_ENV" = 1`; `.claude/skills/cris-managed-session/scripts/create-session.sh` exists and is executable.
2. `git status --porcelain --untracked-files=no` is empty on the base branch (the branch PRs target; you are on it).
3. `docs/STATUS.md` has a row for `<M>` whose owner cell is `unclaimed` or `drv-<M>`.
4. The roadmap row's **plan inputs**: every item that is a §8 decision row must not read `pending`. Items that name a doc count as present. A pending §8 input → name it, stop; the owner logs §8.
5. `.claude/settings.local.json` exists in the root checkout with the owner's allowlist (git, pnpm, gh, tsc, vitest, playwright). Without it, every worker commit is a permission dialog; say so and let the owner decide before spawning.

## Loop

```
claim ─► [plan] ─► [execute]* ─► [finish] ─► owner merges
            └──── NEEDS-OWNER: relay questions, send answers, same pane ────┘
```

Role order: `plan`, `execute` (repeat while `CONTINUE`), `finish`. Gate probes (0B–0E): `probe`, then `finish`. All scripts run from the root checkout or the worktree; both resolve the same paths.

1. **Claim.** `scripts/milestone/claim <M>` → `WORKTREE BRANCH BASE SLUG`. `SLUG` is the plan-file stem from the STATUS row (`0A-scaffold`).
2. **Spawn.** `scripts/milestone/spawn <M> <role>` → `PANE N`. It deletes the previous `handoff.md` and copies the local allowlist into the worktree. Then `herdr agent wait <PANE> --until idle --timeout 60000`; `agent_not_found` in the first seconds is normal, retry once. A fresh worktree shows Claude Code's trust dialog (`blocked`; `herdr agent explain <PANE>` prints its text): tell the owner, they accept it in the pane (`herdr agent focus <PANE>`), re-run the wait. Never accept it for them.
3. **Brief.** Write `<WORKTREE>/docs/sdd/<M>/session-<N>-brief.md`: common header + role block from `references/briefs.md`, every `<…>` filled from step 1, the roadmap row, and the previous handoff's `next`. `{…}` fields are the worker's; leave them.
4. **Send.** `herdr agent prompt <PANE> "Read docs/sdd/<M>/session-<N>-brief.md and follow it exactly." --wait --timeout 5400000`, in the background. Let the completion notification wake you; never poll with sleep.
5. **Read.** `scripts/milestone/status <M>`. A handoff counts only if `session: <N>` matches; otherwise treat it as missing. Then:

| outcome | driver does |
|---|---|
| `NEEDS-OWNER` | Put the questions to the owner verbatim (`AskUserQuestion` when they are choices). Send the *answers* message from `references/briefs.md` to the **same pane** with `herdr agent prompt … --wait`. Back to step 5. If the pane is gone, step 2 with a new brief whose "Previous answers" section holds them. |
| `CONTINUE` | `stop-session.sh <PANE>`. Step 2 with the same role. |
| `DONE` | Check the role's artifacts in the `status` output (plan: `<SLUG>.spec.md`, `.impl.md`, `<SLUG>.md`, `progress.md`; execute: no unfinished task in `progress.md`; finish: a PR URL in `evidence`). Missing → treat as `BLOCKED`. Else `stop-session.sh <PANE>`, next role. After `finish`: report the PR URL and `evidence` to the owner, stop. |
| `BLOCKED` | `stop-session.sh <PANE>`. Report `summary`, `evidence`, `next` verbatim. Stop the loop. |
| missing | `herdr agent get <PANE>`: `working` → wait again (same timeout). Else `herdr agent read <PANE> --lines 60`, report what the worker was doing, ask the owner. Never infer an outcome. |

Wait result `blocked` mid-turn is a permission dialog: `herdr agent read <PANE> --lines 40`, show the owner, they answer in the pane, then wait again. `stop-session.sh` is `.claude/skills/cris-managed-session/scripts/stop-session.sh`.

## Owner gates (stop and ask; never proxy the owner)

Pending §8 plan input · brainstorm questions · a roadmap task whose verification cell names the owner · an ADR draft · any Claude Code dialog in a pane · PR merge · §8 entries · removing the STATUS row after merge.

## Driving a phase

"Drive phase N" = the milestones of the roadmap phase section in dependency order (`0A` before `0B–0E`; `1A` before `1B–1E`). One milestone at a time by default. Independent milestones run in parallel only when the owner says so: each has its own worktree, pane, and background wait; never two workers on one milestone.

## Red flags

- Driver editing anything in the worktree except `session-*-brief.md`.
- A worker prompt longer than one line (it belongs in the brief).
- Answering a brainstorm question or a pane dialog yourself.
- Acting on a handoff whose `session:` is not this session's `N`.
- Reopening a pane after `stop-session.sh` instead of writing a resume brief.
- Merging, editing `§8`, removing the STATUS row. Owner only.
