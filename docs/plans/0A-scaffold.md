# 0A — Scaffold, harness, `gesture-core` v0 — Plan

**Milestone:** 0A (`docs/05-roadmap.md §3.1`) · **Branch:** `0A` · **Date:** 2026-09-04
**Spec:** [`0A-scaffold.spec.md`](./0A-scaffold.spec.md) · **Implementation:** [`0A-scaffold.impl.md`](./0A-scaffold.impl.md)

Architectural plan in the five-question form (`docs/plans/README.md`). Detail and code live in the spec and impl files; this page is the boundary-level decision record plus the frozen exit checks and the session status.

## 1. Placement

Repo-wide scaffolding, so ownership is per artifact:
- **`packages/protocol`** owns every cross-boundary shape fixed here — `GestureFrame` v0, `FixtureRecord`, `Intent` v0 (provisional), `BenchRow`/`BENCH_COLUMNS`. It is the package that joins components.
- **`packages/gesture-core`** owns the pure-TS perception features, 1€ filter, classifier interface + kNN placeholder, and the XState FSM. **All gesture timing/hysteresis/cooldown/confidence gating lives in its machine and nowhere else** — no second place decides gesture timing.
- **`apps/playground`** owns the bench harness and CSV emitter; **`fixtures/`** owns fixture data, recorder, player, synthetic generator; **`apps/extension`** is a buildable WXT skeleton (entrypoints filled by 0B/1B/1C/1D); **`packages/page-index`** is a stub (1C).

Task 0.3 (`CLAUDE.md`) is already satisfied by the repo — noted, no task.

## 2. Boundary check

Imports/APIs vs each owner's `.claude/rules/<component>.md` (full table in spec §2, Q2):
- `protocol` → `zod` only. ✓
- `gesture-core` → pure TS, `xstate`, `zod`, **and `@gesture/protocol` (types only)**. The rule file lists only "pure TS, xstate, zod", so **`.claude/rules/gesture-core.md` gains `@gesture/protocol` in this milestone** (impl Task 3, step 1) — the FSM emits `Intent` and `replayFixture` consumes `FixtureRecord`, both protocol-owned. This is the correct boundary being completed, not a §3 deviation, so no ADR; it changes its rule file in the same PR (CLAUDE.md §5). No DOM/`chrome.*`/`fetch`/non-XState timers. ✓
- `page-index` (stub) → DOM. ✓ · `playground` → gesture-core, protocol, `@mediapipe/tasks-vision`. ✓ · `fixtures` scripts → protocol, gesture-core. ✓

All packages export only via `package.json` `exports`; no deep imports. **Flagged for the owner:** the `.claude/rules/gesture-core.md` edit is outside this planning session's write scope; it is carried as impl Task 3 step 1 and listed under Proposed decisions.

## 3. Interfaces touched

Four Zod shapes added in `packages/protocol`, defined there first (spec §3–§4):
`GestureFrame` v0 (adopts `02-architecture §6`), `FixtureRecord` (raw MediaPipe landmarks), `Intent` v0 (**provisional — 1A finalizes**), `BenchRow` + `BENCH_COLUMNS`. Both sides change only after protocol. The three fixed here (fixture record, `GestureFrame` v0, bench CSV) are consumed by 0B, 0D, 1A and are asserted by the frozen contract tests below.

## 4. Principle check (`02-architecture §1`)

- **Two loops two speeds** — 0A builds the fast-loop primitives as pure TS, verifiable without camera/network; no agent loop. ✓
- **Video stays in one process** — fixtures persist landmarks + a paired y4m *test input*, never exported pipeline video; the `VideoFrame`/`ImageBitmap`-outside-offscreen lint (Task 7) enforces it. ✓
- **Page is hostile** / **Agent proposes, human disposes** — N/A in 0A (no page/agent code). 
- **Replaceable parts** — `Classifier` interface + kNN placeholder, filter/normalizer/FSM behind small pure functions, delegate selection in the bench. ✓

## 5. Tests

Fixture round-trip (exit); protocol schema tests; gesture-core unit tests (filter, normalizer, features, FSM); headless bench CSV (exit); three frozen contract tests for the fixed interfaces. Fixture-first: any threshold/filter change replays the suite. See spec §5 / impl Tasks 2–7.

## Five-question checklist on `0A-scaffold.impl.md`

- **Placement** — every task has one owning component in its `[<component>]` commit tag and Files block; no task spans two owners. ✓
- **Boundary** — the one boundary change (`gesture-core → protocol`) is explicit in Task 3 step 1 and edits its rule file in the same commit. ✓
- **Interfaces** — protocol schemas land first (Task 2) before any consumer (Tasks 3–7). ✓
- **Principles** — no task introduces agent timing outside the FSM, video outside offscreen, or a second gesture-timing site (enforced by Task 7 lint). ✓
- **Tests** — every task ends with an independently runnable test; the two exit criteria and three contract tests have named commands below. ✓

## Exit checks

Frozen at plan time. `scripts/milestone/exit-check 0A` runs these after every session; a later edit to this table or to a contract test it names is reported as `TAMPERED` (re-plan, never a quiet fix). Criterion cells are verbatim from the roadmap row §3.1 (Exit cell split at `;`, then Interfaces fixed here).

| # | Criterion (verbatim) | Kind | Check |
|---|---|---|---|
| E1 | `pnpm build`, `pnpm test` green from a clean clone | clean-clone | `pnpm install --frozen-lockfile && pnpm build && pnpm test` |
| E2 | fixture round-trip test | mechanical | `pnpm vitest run packages/gesture-core/test/roundtrip.test.ts` |
| E3 | bench harness runs headless on a placeholder y4m | mechanical | `pnpm --filter @gesture/playground test:bench` |
| I1 | Fixture record shape | consumer:0B,0D,1A | `pnpm vitest run packages/protocol/test/contracts/fixture-record.contract.test.ts` |
| I2 | GestureFrame v0 | consumer:0B,0D,1A | `pnpm vitest run packages/protocol/test/contracts/gestureframe-v0.contract.test.ts` |
| I3 | bench CSV schema | consumer:0B,0D,1A | `pnpm vitest run packages/protocol/test/contracts/bench-csv.contract.test.ts` |

The `I` contract tests are written from the consumer's side (what 0B/0D/1A read from each shape), assert through the `@gesture/protocol` public export, fail today, and are made to pass by execute (Task 2) without being edited.

## Status

_Owned by the 0A session; rewritten, not appended._

**Done (session 1, plan):**
- Task 0.1 — 04-feasibility §4 edits applied to docs 01–03 (commit 93ddfb3), owner-approved.
- Spec (`0A-scaffold.spec.md`), implementation plan (`0A-scaffold.impl.md`), this plan, the Exit checks table, and the three frozen contract tests written.
- SDD workspace generated under `docs/sdd/0A/`.

**In progress:** none (planning complete; ready for execute sessions).

**Next:** execute impl Task 1 (monorepo scaffold), then Tasks 2–8 in order; one execute session per task, scope derived from each task's Files block.

**Proposed decisions for roadmap §8 (owner logs; agent does not edit §8):**
- 0A fixes three interfaces for 0B/0D/1A: `FixtureRecord` (raw MediaPipe landmarks, `gesture-fixture/v0`), `GestureFrame` v0, bench CSV `BENCH_COLUMNS`. `Intent` v0 is provisional and finalized by 1A.
- `.claude/rules/gesture-core.md` "May depend on" gains `@gesture/protocol` (types only) — boundary refinement, applied in impl Task 3 (not a §3 deviation).
- Owner Q1–Q4 (handoff 2026-09-04) adopted: raw landmarks in fixtures; all fixed shapes in `packages/protocol`; provisional `Intent` v0; synthetic placeholder fixture + y4m for camera-free CI.

**Blockers:** none.

**Superpowers conflicts noted (CLAUDE.md §6):** none material; spec/plan written to `docs/plans/` per the repo override, contract tests are the only code path in the plan session's scope.
