# 0A-scaffold — SDD progress ledger

Tracked history for the execute phase of milestone 0A. Plan: `docs/plans/0A-scaffold.impl.md`. One execute session per task; write scope derived from that task's **Files:** block. Regenerate a task brief with `scripts/sdd/task-brief docs/plans/0A-scaffold.impl.md <N>` (from repo root). Mark a task done only when its step tests pass and it is committed as `[<component>] task <N>: <title>`.

| Task | Title | Owner rule | State | Commit |
|---|---|---|---|---|
| 1 | Monorepo scaffold and tooling | protocol/* | not started | — |
| 2 | protocol — schemas for the three fixed interfaces + Intent v0 | `.claude/rules/protocol.md` | not started | — |
| 3 | gesture-core v0 (filter, normalizer, features, classifier, FSM, replay) + rule edit | `.claude/rules/gesture-core.md` | not started | — |
| 4 | Fixtures — synthetic generator, placeholder fixture + y4m, player/recorder | `.claude/rules/fixtures-and-tests.md` | not started | — |
| 5 | playground — bench harness with CSV export, headless bench | `.claude/rules/fixtures-and-tests.md` | not started | — |
| 6 | extension — buildable WXT (MV3, React) skeleton | — | not started | — |
| 7 | CI + trust-boundary lint rules | `.claude/rules/fixtures-and-tests.md` | not started | — |
| 8 | docs/spike-results.md template (0.12) | — | not started | — |

## Exit checks (frozen — see `docs/plans/0A-scaffold.md ## Exit checks`)

Run `scripts/milestone/exit-check 0A --fast` after each session.

| # | Criterion | State |
|---|---|---|
| E1 | `pnpm build`, `pnpm test` green from a clean clone | not yet |
| E2 | fixture round-trip test | not yet |
| E3 | bench harness runs headless on a placeholder y4m | not yet |
| I1 | Fixture record shape | not yet (contract test present, fails until Task 2) |
| I2 | GestureFrame v0 | not yet (contract test present, fails until Task 2) |
| I3 | bench CSV schema | not yet (contract test present, fails until Task 2) |

## Log

- 2026-09-04 (session 1, plan): planning complete. Task 0.1 doc edits applied and approved (93ddfb3). Spec, impl plan, plan, frozen exit checks, and the three frozen contract tests committed. SDD workspace created. Task 0.3 noted already satisfied by the repo. Execute phase starts at Task 1.
