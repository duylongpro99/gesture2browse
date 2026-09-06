# SDD ledger — plan: docs/plans/1A-vertical-slice.impl.md

Milestone 1A, execute session 1. Owns Tasks 1 (`protocol`) and 2 (`gesture-core`) per `.claude/scope.json`.
Spec: `docs/plans/1A-vertical-slice.spec.md` (binding authority). SDD workspace: `docs/sdd/1A-vertical-slice/`.

## Preflight scan

| Pair / task | produces → consumes | Finding |
|---|---|---|
| Task 1 → Task 2 | Task 1 exports `TransitionLogEntry`/`Intent` from `@gesture/protocol`; Task 2 imports them | Sequential dependency, correct order (1 before 2). No shared files. Clean. |
| Task 1 self | new schemas + `schemas.test.ts` cases vs frozen contract tests `1C-{intent,pagecommand,pageevent}` | Contract tests already exist and must be made to pass unedited. Consistent. |
| Task 2 self | compound `Armed` vs existing `machine.test.ts` asserting `value === 'Armed'` | Existing assertions break once `Armed` is compound (value becomes `{Armed:'Idle'}`). Plan explicitly says extend `machine.test.ts` for substates — implementer must update those assertions. Expected, not a conflict. |
| Task 2 self | `dy = Math.round(vy * SCROLL_PX_PER_UNIT)` (px) vs current `Math.round(vy / SCROLL_STEP)` | Constant/threshold change → fixture replay is the failing test; `replay-scroll.test.ts` (E1, created in Task 2) is that replay. Consistent. |

Scan clean; no cross-task contradiction. Sequential dispatch 1 → 2.

## Tasks

Base before Task 1: 76503d9
Task 1: complete (commits 76503d9..17a4b87, review clean) — protocol schemas; 31 tests pass, typecheck clean.
Note: `packages/protocol` `exports` resolve through `dist/` — consumers must `pnpm build` after protocol src changes or tests run against stale dist. Carried into Task 2 dispatch.

Base before Task 2: 17a4b87
Task 2: implemented (commit 1afe418) — compound FSM + replay; 19/19 pass, typecheck clean.
Task 2 review: Spec ❌ (Critical), Quality ✅. Critical: `createGestureRunner().send()` returns cumulative history across all calls, but brief requires per-frame delta ("return the intents emitted" for that send); Task 5 (SW live log) reuses `createGestureRunner` and needs per-frame deltas (unbounded growth otherwise). Minor (deferred): `emitted[0]` single-intent attach — matches brief's singular `intent?`, not a defect. Fix round 1 dispatched.
Task 2 fix-base (review head): 1afe418
Task 2: fix round 1/5 (1 addressed, 0 open — send() now per-frame delta, replayFrames accumulates; +2 per-frame tests; commits 1afe418..48481dc)
Task 2: complete (commits 17a4b87..48481dc, review clean) — 21/21 gesture-core tests pass, typecheck clean.

Both owned tasks (1, 2) complete. Tasks 3-6 (content, offscreen, background, e2e) remain for later sessions → CONTINUE.

## Session 2 (reconcile)
Verified committed Tasks 1–2 at 75193c0 (owner answer #2): typecheck clean, vitest 67/67 green, exit-check 7 PASS / 1 FAIL (E2 pending Task 6), lock OK. No regression, no ledger change needed beyond this note. Session 3 does Task 3.

Deferred minor (for final whole-branch review at Task 6): replay.ts `emitted[0]` single-intent attach on TransitionLogEntry — matches brief's singular `intent?`; revisit only if the machine ever adds multi-intent transitions.

