# Milestone plans

Three files per milestone, all named after the roadmap id (`0A-scaffold`, `1A-vertical-slice`, …):

| File | Written by | Contents |
|---|---|---|
| `<milestone>.md` | session, in the five-question form below | Architecture plan: placement, boundary check, interfaces, principles, tests. Plus `## Exit checks` (frozen at plan time, see below), `## Status` (see below) and links to the two files under it. |
| `<milestone>.spec.md` | superpowers `obra-brainstorming` | Validated design. Must answer the five questions. |
| `<milestone>.impl.md` | superpowers `obra-writing-plans` | Bite-sized tasks with code. Header "Global Constraints" names the owning `.claude/rules/<component>.md`. Run the five-question checklist on it before executing; a boundary error in the plan multiplies into every task. |

Its SDD workspace is `docs/sdd/<milestone>/` (see `docs/sdd/README.md`).

Written once per milestone, after its plan inputs in `docs/05-roadmap.md §8` are present. Sessions inside a milestone read the plan, not the roadmap. Re-opening a placement or interface decision means re-planning the milestone and logging why in roadmap §8.

## Inputs to read when writing a plan

The roadmap milestone row (`docs/05-roadmap.md §3–6`), its plan inputs in `§8`, `docs/02-architecture.md §3` for the component, `§6` for interfaces. Nothing else from `docs/` unless the row points there.

## The five questions (`CLAUDE.md §1`)

A plan is not done until it answers these in writing:

1. **Placement.** Which component owns the change: offscreen (perception), service worker (control), content script (page), side panel (UI), companion (agent), or a `packages/*` library? One owner. If the answer is "two components", name the message in `packages/protocol` that connects them.
2. **Boundary check.** List the imports and runtime APIs the change needs and confirm each is allowed by the owner's `.claude/rules/<component>.md`. Anything not allowed is a redesign or a formal deviation (`docs/adr/README.md`), never a quiet exception.
3. **Interfaces touched.** Does it add or change a `GestureFrame`, `PageCommand`, `PageEvent`, `CompanionMsg`, `CompanionEvt`, `Intent`, or `Action` shape? If yes, the Zod schema in `packages/protocol` changes first, then both sides.
4. **Principle check.** Re-read the five principles in `docs/02-architecture.md §1` (two loops two speeds; video stays in one process; page is hostile; agent proposes human disposes; replaceable parts) and state which ones the change touches and how it respects them.
5. **Tests.** Which fixture, FSM model test, snapping test, or e2e asserts the behaviour. A threshold or gesture change without a fixture replay is incomplete.

When a plan cannot satisfy one of these, stop and surface it. Do not "start with a quick version and refactor later".

## `## Status` in `<milestone>.md`

Owned by the session on this milestone; rewritten, not appended.
- Done / In progress / Next
- Proposed decisions for roadmap §8 (owner logs them; the agent does not edit §8): a paragraph headed `**Proposed decision(s) for roadmap §8 (owner logs; agent does not edit §8):**`, then the complete §8 table row in a blockquote (`> | date | decision | input | result |`) so `scripts/milestone/log-decision` can apply it on the owner's approval after the merge
- Blockers

`docs/STATUS.md` holds only the one-sentence summary row that points here.

## `## Exit checks` in `<milestone>.md`

The roadmap row's **Exit** cell and **Interfaces fixed here** cell, turned into commands at plan time, before any code exists. `scripts/milestone/exit-check <M>` runs them after every session and joins them with the worker's `exit-progress` on the Criterion text; the driver relays disagreement to the owner. Written once by the plan session, shown to the owner, then frozen (`exit-check --freeze`): a later edit to the table or to a contract test it names is reported as `TAMPERED` and means re-planning (roadmap §2.1, §7), never a quiet fix.

```markdown
## Exit checks

| # | Criterion (verbatim) | Kind | Check |
|---|---|---|---|
| E1 | <one Exit criterion, verbatim from the roadmap row> | clean-clone | `pnpm install --frozen-lockfile && pnpm build && pnpm test` |
| E2 | <next criterion> | mechanical | `pnpm vitest run <path>` |
| E3 | <a criterion only the owner can verify> | owner | - |
| I1 | <one item of Interfaces fixed here, verbatim> | consumer:<M>[,<M>] | `pnpm vitest run <owner package>/test/contracts/<consumer>-<interface>.contract.test.ts` |
```

- `E` rows: one per criterion in the Exit cell (split at `;`). `I` rows: one per item in Interfaces fixed here; `consumer:` names only milestones that cell says consume it.
- Kinds: `mechanical` runs in the worktree; `clean-clone` runs in a fresh `git clone` of the branch (`--fast` runs it in the worktree); `consumer:<M>` is a contract test written from the consumer's side and frozen with the table; `owner` has no command.
- A contract test asserts what the consumer's roadmap row needs from the shape, through the owning package's public export (`package.json` `exports`, no deep imports). It fails until execute makes it pass; execute never edits it.
- Commands start with `pnpm`, `npx`, `node`, `turbo`, `tsc`, `vitest`, `playwright`, `bash`, `sh`, `test` or `scripts/`; anything else is `REFUSED`. No `|` inside a cell. The Criterion cell is the join key: `exit-progress` lines quote it verbatim.

## Superpowers

Overrides for the `obra-*` skills in this repo. `CLAUDE.md §6` holds the summary; this section is the detail. The kit is never edited.

**Paths.** Superpowers writes into `docs/`, nowhere else. `scripts/hooks/guard-superpowers-paths.sh` (wired in `.claude/settings.json`) denies any tool call targeting the forbidden directories and denies running `sdd-workspace`, `task-brief`, `review-package` by any path other than `scripts/sdd/<name>` from the repo root. The skill text says "from this skill's directory"; that is the one instruction in the skills you must not follow.

| Superpowers default | Here |
|---|---|
| `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` | `docs/plans/<milestone>.spec.md` |
| `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` | `docs/plans/<milestone>.impl.md` |
| `.superpowers/sdd/<plan>/` via the skill's `scripts/sdd-workspace` | `docs/sdd/<milestone>/` via `scripts/sdd/sdd-workspace` (same for `task-brief`, `review-package`: same arguments, same output) |
| `obra-brainstorming` visual companion with `--project-dir` (mockups in `.superpowers/brainstorm/`) | Do not pass `--project-dir` (mockups then go to `/tmp`), or skip the companion |

**Process fit.**
- `obra-brainstorming` / `obra-writing-plans`: "explore project state" means the `CLAUDE.md §0` table, not all of `docs/`. The spec answers the five questions above. The `.impl.md` header "Global Constraints" names the owning `.claude/rules/<component>.md`.
- Brainstorming happens at milestone open. Inside a milestone with an approved `docs/plans/<milestone>.md`, a task-level brainstorm (the skill's "bounded" path) may not re-open placement or interfaces fixed there; if it must, stop and re-plan the milestone (`CLAUDE.md §0` concurrency rules, roadmap §7).
- Run the five-question checklist on the `.impl.md` before `obra-executing-plans` or `obra-subagent-driven-development`.
- Task reviewer adds a third gate to spec compliance and code quality: boundary check against the rule file. A violation is a blocker unless an ADR is linked.
- `obra-test-driven-development` in `gesture-core`: the failing test for a threshold or filter change is a fixture replay.
- `obra-using-git-worktrees` is the mechanism for the one-session-per-milestone rule in `CLAUDE.md §0`.
- `obra-finishing-a-development-branch` also runs `CLAUDE.md §5`: exit criteria from the roadmap row, STATUS row, plan `## Status`, proposed §8 decisions. It never edits §8.
- `obra-verification-before-completion` is `CLAUDE.md §5` in skill form; the commands it runs are `tsc`, lint, boundary check, unit tests, and the fixture replay when thresholds changed.
- On conflict between a skill and `CLAUDE.md` or `.claude/rules/`, `CLAUDE.md` wins (the skills say so themselves); note the conflict in the plan's `## Status`.
