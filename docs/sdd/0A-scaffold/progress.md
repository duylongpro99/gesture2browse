# 0A-scaffold — SDD progress ledger

Tracked history for the execute phase of milestone 0A. Plan: `docs/plans/0A-scaffold.impl.md`. One execute session per task; write scope derived from that task's **Files:** block. Regenerate a task brief with `scripts/sdd/task-brief docs/plans/0A-scaffold.impl.md <N>` (from repo root). Mark a task done only when its step tests pass and it is committed as `[<component>] task <N>: <title>`.

| Task | Title | Owner rule | State | Commit |
|---|---|---|---|---|
| 1 | Monorepo scaffold and tooling | protocol/* | done | 7279f1a, d415e2a |
| 2 | protocol — schemas for the three fixed interfaces + Intent v0 | `.claude/rules/protocol.md` | done | 22e286c |
| 3 | gesture-core v0 (filter, normalizer, features, classifier, FSM, replay) + rule edit | `.claude/rules/gesture-core.md` | done | b057427 |
| 4 | Fixtures — synthetic generator, placeholder fixture + y4m, player/recorder | `.claude/rules/fixtures-and-tests.md` | done | aa5086d |
| 5 | playground — bench harness with CSV export, headless bench | `.claude/rules/fixtures-and-tests.md` | not started | — |
| 6 | extension — buildable WXT (MV3, React) skeleton | — | not started | — |
| 7 | CI + trust-boundary lint rules | `.claude/rules/fixtures-and-tests.md` | not started | — |
| 8 | docs/spike-results.md template (0.12) | — | not started | — |

## Exit checks (frozen — see `docs/plans/0A-scaffold.md ## Exit checks`)

Run `scripts/milestone/exit-check 0A --fast` after each session.

| # | Criterion | State |
|---|---|---|
| E1 | `pnpm build`, `pnpm test` green from a clean clone | PASS (--fast; full clean-clone still to run at finish) |
| E2 | fixture round-trip test | PASS (Task 4: roundtrip.test.ts + placeholder.json) |
| E3 | bench harness runs headless on a placeholder y4m | not yet (Task 5 adds apps/playground) |
| I1 | Fixture record shape | PASS |
| I2 | GestureFrame v0 | PASS |
| I3 | bench CSV schema | PASS |

## Log

- 2026-09-04 (session 1, plan): planning complete. Task 0.1 doc edits applied and approved (93ddfb3). Spec, impl plan, plan, frozen exit checks, and the three frozen contract tests committed. SDD workspace created. Task 0.3 noted already satisfied by the repo. Execute phase starts at Task 1.
- 2026-09-05 (session 3, execute): Tasks 3 and 4 done. Task 3 (b057427) — gesture-core v0: 1€ filter, landmark normalizer, pinch/finger features, `Classifier`+`KnnClassifier`, XState v5 FSM skeleton (Paused/Armed clutch + fist-motion Scroll; all timing in the machine), `replayFixture`; `.claude/rules/gesture-core.md` gains `@gesture/protocol` (types only) in the same commit. 13 gesture-core tests pass (one-euro, normalize, features, machine incl. arm/scroll behaviour, roundtrip); typecheck + lint clean. Task 4 (aa5086d) — synthetic `placeholder.json` (Closed_Fist, 30 frames) + `placeholder.y4m` (64×64 I420, 10 frames), their generators, `play.ts`, `fixtures/README.md`, and `roundtrip.test.ts`. Exit check (`--fast`): E1/E2/I1/I2/I3 PASS, E3 not yet (Task 5). DEVIATION: plan Task 4 step 4 said add `tsx` to root `package.json`; root `package.json` is out of write scope and `tsx` is not in tech-stack §1–2, so the generators run on Node 24's built-in TS support (engines already `>=24`) — no new dep. Follow-up (Task-1 scaffolding, not an exit blocker): root `package.json` should add `@gesture/protocol` + `@gesture/gesture-core` as `workspace:*` devDeps so `scripts/fixtures/{play,generate-placeholder-fixture}.ts` resolve from repo root.
- 2026-09-04 (session 2, execute): Tasks 1 and 2 done. Task 1 (7279f1a) scaffolds the pnpm/Turborepo workspace (root config + protocol/gesture-core/page-index skeletons); build/lint/typecheck green. Task 2 (22e286c) implements the protocol schemas (GestureFrame v0, FixtureRecord, Intent v0, bench) — schemas.test.ts + the three frozen contract tests all pass (21/21). Fix-round d415e2a guards vitest.workspace.ts against the not-yet-created apps/playground so root-level `vitest run` (exit checks E2/I1-I3) does not crash at startup. Exit check (--fast): E1/I1/I2/I3 PASS; E2/E3 not yet (Tasks 4/5). Next: Task 3 (gesture-core).
