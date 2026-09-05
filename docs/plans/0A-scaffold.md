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
| E3 | bench harness runs headless on a placeholder y4m | mechanical | `pnpm exec playwright test -c apps/playground/playwright.config.ts` |
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

**Done (session 2, execute):**
- Task 1 (7279f1a) — pnpm + Turborepo monorepo scaffold: root config (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, eslint/prettier, `vitest.workspace.ts`) and empty-but-buildable `protocol`/`gesture-core`/`page-index` package skeletons. `pnpm build`/`lint`/`typecheck` green.
- Task 2 (22e286c) — `packages/protocol` schemas: `GestureFrame` v0, `FixtureRecord`/`FixtureFrame`/`FixtureMeta`, provisional `Intent` v0, `BENCH_COLUMNS`/`BenchRow`, shared `Handedness`/`GestureLabel` enums. `schemas.test.ts` plus the three frozen contract tests pass (21/21) without editing them.
- Fix-round d415e2a — `vitest.workspace.ts` now references `apps/playground` only once it exists, so root-level `vitest run <path>` (used by exit checks E2/I1–I3) does not crash before Task 5 scaffolds the app.
- Exit check (`--fast`): **E1, I1, I2, I3 PASS**; E2 (roundtrip, Task 4) and E3 (bench, Task 5) not yet.

**Done (session 3, execute):**
- Task 3 (b057427) — `gesture-core` v0: `OneEuroFilter`, `normalizeLandmarks`, `pinchDistance`/`fingerExtension`, `Classifier` interface + `KnnClassifier` placeholder, XState v5 FSM skeleton (`Paused`/`Armed` palm-clutch + fist-motion `Scroll`; **all gesture timing in the machine**, constants in `constants.ts`), `replayFixture`. `.claude/rules/gesture-core.md` "May depend on" gains `@gesture/protocol` (types only) in the same commit (CLAUDE.md §5). 13 tests pass; typecheck + lint clean.
- Task 4 (aa5086d) — synthetic `fixtures/gestures/placeholder.json` (`Closed_Fist`, 30 frames) and `fixtures/bench/placeholder.y4m` (64×64 I420, 10 frames), their generators, `scripts/fixtures/play.ts`, `fixtures/README.md`, and `packages/gesture-core/test/roundtrip.test.ts`.
- Exit check (`--fast`): **E1, E2, I1, I2, I3 PASS**; E3 (bench, Task 5) not yet.

**Deviation (session 3):** impl Task 4 step 4 said add `tsx` to root `package.json`. Root `package.json` is outside this session's write scope, and `tsx` is not listed in tech-stack §1–2 (CLAUDE.md §2 would require a new row). The fixture generators instead run on **Node 24's built-in TypeScript execution** (repo already requires `engines.node >= 24`) — no new dependency, so no ADR and no tech-stack change. Not a §1–2 boundary break; recorded here per CLAUDE.md §6.

**Done (session 4, execute):**
- Task 5 (5e5dee3) — `apps/playground` Vite bench app. `runBench` runs N frames from the fake camera through capture → MediaPipe `HandLandmarker.detectForVideo` → `normalizeLandmarks` → classifier → 1€ filter, timing each stage, and emits one `BenchRow` (validated by `BenchRowSchema`) serialized by `benchToCsv` whose header is `BENCH_COLUMNS.join(',')`. Headless e2e `test/bench.e2e.ts` (exit check E3) drives the page on `fixtures/bench/placeholder.y4m` and asserts a non-empty CSV with the right header and ≥ 1 data row (a CSV gate, not a detection gate — the placeholder video has no hand). `hand_landmarker.task` (float16, 7.5 MB) is committed at the repo root and, with the MediaPipe wasm, served locally by `vite.config.ts` (no CDN — tech-stack §2/§6). Owner-run `recorder.html`/`recorder.ts` included.
- Task 6 (a8682ab) — `apps/extension` WXT 0.21 (MV3) + React 19 skeleton: background, content, offscreen (doc + `inference.worker.ts` stub), side panel (React), grant-camera entrypoints, each a stub commented with the milestone that fills it (0B/1B/1C/1D.1). Manifest: `offscreen`/`sidePanel`/`storage`/`tabs`/`scripting`, optional `debugger`, `<all_urls>`. `wxt build` + `wxt zip` produce a chrome-mv3 zip; typecheck/lint clean.
- Exit check (`--fast`): **all 6 PASS** — E1, E2, E3, I1, I2, I3. E3 is now green (was the Task 5 target). E1 clean-clone still to run without `--fast` at milestone finish.

**Deviations / routine calls (session 4, CLAUDE.md §6):**
- **Playwright browser channel.** The E3 e2e runs full Chromium in new-headless mode (`channel: 'chromium'`), because `chrome-headless-shell` (Playwright's default) does not support `getUserMedia`/fake-media capture — it rejects with `NotSupportedError`. Within §1–2, no new dependency (Playwright already in tech-stack).
- **Model + wasm serving.** Per the Task 5 Files block, the model is committed once at repo root (`hand_landmarker.task`) and served, with the package's wasm, via a small `vite.config.ts` middleware under `/models/`. `apps/playground/public/models/.gitkeep` is kept as the plan specifies; nothing is copied into it. `recorder.html` and `@types/node` were added (both within `apps/playground/**` scope) so the owner recorder is runnable and the Node config files typecheck.
- **WXT / Vite / plugin-react versions.** WXT 0.21.4 requires Vite `^6.3.4 || ^7`, but the playground pins Vite 5, so the extension gets its own `vite@^7` devDep; `@wxt-dev/module-react` then resolves a compatible `@vitejs/plugin-react` v6. `apps/extension/.gitignore` (ignores generated `.wxt/`, `.output/`) and `jsx: "react-jsx"` in `tsconfig.json` were added — routine, within `apps/extension/**` scope. All are within §1–2 (no new runtime dependency; React/Vite/WXT already in tech-stack §1–2).
- **`optional_permissions: ['debugger']` type cast.** WXT's generated `ManifestOptionalPermission` type *excludes* `debugger`, but Chrome accepts it as optional and `wxt build` emits it verbatim; the trusted-click design requests `debugger` at runtime (03-tech-stack B1 / roadmap G5). A single typed assertion via `UserManifest['optional_permissions']` (not `any`, not `@ts-ignore` — within CLAUDE.md §2) keeps the intended manifest while `tsc` passes.

**In progress:** none (scope was Tasks 5–6).

**Next:** execute impl Task 7 (CI workflow + `scripts/lint/boundary-lint.mjs` trust-boundary lint), then Task 8 (`docs/spike-results.md` template). Note Task 7 modifies **root `package.json`** (a `lint:boundary` script) and adds `.github/` and `scripts/lint/` — none in this session's scope; the next session needs those paths in `.claude/scope.json`.

**Scaffolding follow-up still open (not an exit blocker, E2 is green):** root `package.json` should add `@gesture/protocol` and `@gesture/gesture-core` as `workspace:*` `devDependencies` so `scripts/fixtures/play.ts` and `generate-placeholder-fixture.ts` resolve the workspace packages from the repo root. **Not folded into Task 5:** impl Task 5's Files block does not list root `package.json`, and root `package.json` is outside this session's scope, so it was left per the session-4 brief (do not route around the denial). A later session that owns root `package.json` (Task 7 touches it) can fold it in.

**Proposed decisions for roadmap §8 (owner logs; agent does not edit §8):**
- 0A fixes three interfaces for 0B/0D/1A: `FixtureRecord` (raw MediaPipe landmarks, `gesture-fixture/v0`), `GestureFrame` v0, bench CSV `BENCH_COLUMNS`. `Intent` v0 is provisional and finalized by 1A.
- `.claude/rules/gesture-core.md` "May depend on" gains `@gesture/protocol` (types only) — boundary refinement, applied in impl Task 3 (not a §3 deviation).
- Owner Q1–Q4 (handoff 2026-09-04) adopted: raw landmarks in fixtures; all fixed shapes in `packages/protocol`; provisional `Intent` v0; synthetic placeholder fixture + y4m for camera-free CI.

**Blockers:** none.

**Superpowers conflicts noted (CLAUDE.md §6):** none material; spec/plan written to `docs/plans/` per the repo override, contract tests are the only code path in the plan session's scope.
