# 0A — Scaffold, harness, `gesture-core` v0 — Design spec

**Status:** validated design · **Date:** 2026-09-04 · **Milestone:** 0A (`docs/05-roadmap.md §3.1`)
**Inputs:** roadmap row §3.1; `02-architecture.md §3, §6, §10`; `03-tech-stack.md §1–2, §4`; `04-feasibility §4–5`; `.claude/rules/{protocol,gesture-core,fixtures-and-tests,page-index}.md`; consumer rows 0B/0D (§3.2), 1A (§4.1).

This is the milestone-open spec. It fixes three interfaces consumed downstream (fixture record shape, `GestureFrame` v0, bench CSV schema — consumed by 0B, 0D, 1A), the repo layout, package boundaries, and the `gesture-core` v0 public API. Owner-approved decisions Q1–Q4 (`handoff` 2026-09-04): store raw MediaPipe landmarks in fixtures; put all fixed shapes in `packages/protocol`; a provisional `Intent` v0 that 1A finalizes; a synthetic placeholder fixture + placeholder y4m so CI is camera-free.

---

## 1. Scope

**In (0A builds):**
- pnpm + Turborepo monorepo per `02-architecture §10`, with WXT (React) extension app scaffolded.
- `packages/protocol`: Zod schemas + inferred types for `GestureFrame` v0, `FixtureRecord`, `Intent` v0 (provisional), `BenchRow` + `BENCH_COLUMNS`, and the shared enums.
- `packages/gesture-core` v0: 1€ filter, landmark normalizer, pinch/finger features, `Classifier` interface + kNN placeholder, XState FSM skeleton, `replayFixture`.
- `apps/playground`: bench harness (per-stage timers, fps, delegate switch, `GestureRecognizer` vs `HandLandmarker`, 480p/720p, CSV export) runnable headless against a placeholder y4m.
- `fixtures/`: fixture JSON format (via the protocol schema), a fixture **player** (through `gesture-core`), a **recorder** (live-camera capture path, owner-run), a **synthetic generator** for the CI placeholder fixture + a placeholder y4m.
- CI: lint, Vitest, Playwright with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture`, extension zip artifact.
- The trust-boundary lint rules from `.claude/rules/fixtures-and-tests.md` (VideoFrame/ImageBitmap outside offscreen; API key outside `background.ts`; content script importing the agent package).

**Scaffolded but empty/stub in 0A** (owned by later milestones): `packages/page-index` (1C), the extension perception/content/sidepanel entrypoints beyond a buildable skeleton (0B, 1B, 1C, 1D).

**Out:** any real MediaPipe frame-pump wiring in the *extension* offscreen doc (that is 0B/G1); real multi-subject recordings (owner, G4); classifier training (1B); actions/agent (1C/2A).

**Already satisfied by the repo (note, no task):** task 0.3 `CLAUDE.md` — the root `CLAUDE.md` plus `.claude/rules/*` already cover commands-by-reference, package boundaries, video-never-leaves-worker, fixture-first, one-milestone-one-plan. 0A adds only what is missing (a top-level "Commands" quick-reference is optional; not required for exit).

---

## 2. The five questions (`docs/plans/README.md`)

### Q1. Placement
0A is repo-wide scaffolding, so ownership is per artifact, not one component:
- **`packages/protocol`** owns every cross-boundary shape fixed here (`GestureFrame` v0, `FixtureRecord`, `Intent` v0, `BenchRow`/`BENCH_COLUMNS`). It is the package that joins components (`.claude/rules/protocol.md`).
- **`packages/gesture-core`** owns the pure-TS perception features, the 1€ filter, the classifier interface, and the FSM. All gesture timing/hysteresis/cooldown/confidence gating lives in its XState machine and nowhere else (`.claude/rules/gesture-core.md`, principle "one place decides gesture timing").
- **`apps/playground`** owns the bench harness and its CSV emitter.
- **`fixtures/`** owns fixture data, the recorder, the player, and the synthetic generator.

No second place decides gesture timing; no duplicated shape definitions (all in protocol).

### Q2. Boundary check
Imports/APIs each package needs, checked against its rule file:

| Package | Needs | Rule allows? |
|---|---|---|
| `protocol` | `zod` only | ✓ (`protocol.md`: "may depend on zod only") |
| `gesture-core` | pure TS, `xstate`, `zod`, **and types from `@gesture/protocol`** | **Rule gap:** `gesture-core.md` lists "pure TS, xstate, zod" but not `protocol`. `Intent`/`GestureFrame`/`FixtureRecord` are protocol-owned shapes the FSM emits/consumes, so gesture-core must import them. → **`.claude/rules/gesture-core.md` must add `@gesture/protocol` (types only, still pure TS) to its allowed deps, in this milestone** (CLAUDE.md §5: a changed boundary changes its rule file in the same PR). No DOM/`chrome.*`/`fetch`/non-XState timers — preserved. |
| `page-index` | DOM (stub in 0A) | ✓ (`page-index.md`) |
| `playground` | `@gesture/gesture-core`, `@gesture/protocol`, `@mediapipe/tasks-vision` | ✓ (fixtures/tests rule; playground is a Phase-0 page) |
| `fixtures` (scripts/tests) | `@gesture/protocol`, `@gesture/gesture-core` | ✓ |

Public API only via `package.json` `exports`; no deep imports (both rule files). The `gesture-core → protocol` rule edit is the one boundary change; it is not a §3 deviation (it is the correct boundary, an under-specified rule being completed), so no ADR — but it touches `.claude/rules/`, outside this planning session's write scope, so it is an impl task and is flagged for the owner.

### Q3. Interfaces touched
Adds four Zod shapes in `packages/protocol`, defined there first:
- **`GestureFrame` v0** — adopts the `02-architecture §6` sketch as the fixed v0 (see §3.1).
- **`FixtureRecord`** — new; raw-landmark fixture format (see §3.2).
- **`Intent` v0** — new, **provisional**; the FSM skeleton emits it; 1A finalizes/extends it (not in 0A's "interfaces fixed here"). Marked provisional in code and plan.
- **`BenchRow` + `BENCH_COLUMNS`** — new; bench CSV schema (see §3.3).

### Q4. Principle check (`02-architecture §1`)
- **Two loops, two speeds** — 0A builds the fast-loop primitives (filter, features, FSM) as pure TS with no network/model dependency; verifiable via fixtures without a camera. No agent loop in 0A. ✓
- **Video stays in one process** — fixtures persist landmarks (numeric coords) and paired y4m *test input*, never exported pipeline video. The `VideoFrame`/`ImageBitmap`-outside-offscreen lint (0.4) enforces it going forward. ✓
- **Page is hostile** — N/A in 0A (`page-index` is a stub); no page interaction yet.
- **Agent proposes, human disposes** — N/A in 0A (no agent).
- **Replaceable parts** — directly served: `Classifier` interface + kNN placeholder, filter/normalizer/FSM behind small pure functions, delegate selection in the bench harness. ✓

### Q5. Tests
- **Fixture round-trip** (exit): a `FixtureRecord` → JSON → Zod parse → deep-equal, then `replayFixture` through `gesture-core` yields the expected `Intent[]`.
- **protocol schema tests**: valid/invalid parse for each schema; `BENCH_COLUMNS` ↔ `BenchRow` key agreement.
- **gesture-core unit tests**: 1€ filter step/jitter response; `normalizeLandmarks` invariants (wrist at origin, unit scale, mirror); `pinchDistance` = dist(4,8)/dist(0,9); `fingerExtension`; FSM transitions (`Paused`→`Armed`→`Scroll`, arm/pause via palm hold) with XState.
- **bench harness headless** (exit): Playwright with fake device runs the harness on the placeholder y4m and writes a CSV whose header equals `BENCH_COLUMNS`.
- **Contract tests (interfaces fixed here)** under `packages/protocol/test/contracts/` — one per fixed interface, asserting what 0B/0D/1A read, through the `@gesture/protocol` public export; each fails today, execute makes it pass, execute may not edit it.

---

## 3. Interface definitions (fixed here)

All in `packages/protocol`, exported from its `package.json` `exports`. Shapes are Zod; types are `z.infer`. Shared enums:
```
Handedness   = z.enum(['Left','Right'])
GestureLabel = z.enum(['none','Closed_Fist','Open_Palm','Pointing_Up',
                       'Thumb_Down','Thumb_Up','Victory','ILoveYou'])
```
`GestureLabel` includes the mandatory `'none'` class (04-feasibility B4). Custom labels extend it in Phase 3; v0 fixes this set.

### 3.1 `GestureFrame` v0
Adopts `02-architecture §6`:
```
GestureFrame = z.object({
  ts:         z.number(),                 // performance.now() in the producing context
  present:    z.boolean(),
  handedness: Handedness.optional(),
  gesture:    GestureLabel.optional(),    // classifier output; absent/‘none’ when idle
  score:      z.number(),                 // classifier confidence [0,1]
  pinch:      z.number(),                  // dist(4,8)/dist(0,9)
  fingers:    z.tuple([z.boolean(),z.boolean(),z.boolean(),z.boolean(),z.boolean()]),
  velocity:   z.object({ vx: z.number(), vy: z.number() }),  // wrist, normalized units/s
  scale:      z.number(),                  // hand bbox height, distance proxy
  pointer:    z.object({ x: z.number(), y: z.number() }),     // filtered, [0,1] viewport
  landmarks:  z.array(z.number()).length(63).optional(),      // raw, only when recording
})
```
1A extends (adds nothing structural required; may add fields). It does not redefine.

### 3.2 `FixtureRecord` (raw-landmark fixture, Q1)
One JSON file per clip = one `(gesture × subject × distance × palmOrientation)`.
```
FixtureFrame = z.object({
  ts:             z.number(),                          // ms from clip start
  present:        z.boolean(),
  landmarks:      z.array(z.number()).length(63).optional(),  // image-normalized 21×3; present ⇔ present===true
  worldLandmarks: z.array(z.number()).length(63).optional(),  // metric 21×3
  score:          z.number().optional(),               // landmarker handedness/presence score
})
FixtureMeta = z.object({
  subjectId:       z.string(),
  gestureLabel:    GestureLabel,
  distanceM:       z.union([z.literal(0.5), z.literal(1.0), z.literal(1.5)]),
  palmOrientation: z.enum(['toward','away']),
  handedness:      Handedness,
  fps:             z.number(),
  source:          z.string().optional(),              // paired y4m filename
  recordedAt:      z.string(),                          // ISO 8601
  lighting:        z.string().optional(),
  notes:           z.string().optional(),
})
FixtureRecord = z.object({
  schema: z.literal('gesture-fixture/v0'),
  meta:   FixtureMeta,
  frames: z.array(FixtureFrame),
})
```
Raw MediaPipe output is stored (not pre-normalized) so `gesture-core`'s normalizer, features, and classifier are all exercised by replay. `worldLandmarks` kept for the palm-turn secondary vote (04-feasibility B4/Tier C pinch metric).

### 3.3 Bench CSV schema
```
Delegate   = z.enum(['webgl','wasm'])
Recognizer = z.enum(['handlandmarker','gesturerecognizer'])
Resolution = z.enum(['480p','720p'])
BENCH_COLUMNS = [
  'device','delegate','recognizer','resolution','numHands',
  'frames','durationMs',
  'fpsMean','fpsP50','fpsP05',
  'captureMsP50','inferMsP50','normalizeMsP50','classifyMsP50','filterMsP50','totalMsP50',
  'inferMsP95','coldInitMs','droppedFrames','notes'
] as const
BenchRow = z.object({ /* one field per column; numeric columns z.number(), enums as above, device/notes z.string() */ })
```
`BENCH_COLUMNS` is the single source of column order; the playground emitter and 0B's fps logger both format rows through it. One row per `(device × delegate × recognizer × resolution)` run with aggregate stats.

---

## 4. `gesture-core` v0 public API
Pure TS. Depends on `xstate`, `zod`, and `@gesture/protocol` (types). Exported via `exports`:
- `class OneEuroFilter` — `new OneEuroFilter({ minCutoff, beta, dCutoff })`, `filter(x: number, tsMs: number): number`; helper `filterLandmarks(prev, next, tsMs)` for the 0/4/8/9 + pointer set.
- `normalizeLandmarks(raw: number[/*63*/], opts?: { mirror?: boolean }): number[/*63*/]` — translate to wrist (0), scale by dist(0,9).
- `pinchDistance(landmarks: number[]): number` — dist(4,8)/dist(0,9).
- `fingerExtension(landmarks: number[]): [boolean,boolean,boolean,boolean,boolean]`.
- `interface Classifier { classify(input: number[/*63 normalized*/]): { label: GestureLabel; score: number } }`, and `class KnnClassifier implements Classifier` (placeholder; nearest-neighbour over a tiny in-memory sample set, returns `'none'` by default).
- `createGestureMachine()` — XState v5 `setup()` actor; states `Paused`, `Armed.Idle`, `Armed.Scrolling`; consumes `GestureFrame`, emits `Intent` (`Arm`/`Pause` on palm-hold, `Scroll{dy}` on fist move). Skeleton for the 1A slice; hold-times/thresholds are named constants, tuned later.
- `replayFixture(record: FixtureRecord): Intent[]` — drives each frame through normalize → features → classifier → machine and collects emitted intents. The round-trip harness.

`Intent` v0 (provisional, in protocol):
```
Intent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Arm') }),
  z.object({ type: z.literal('Pause') }),
  z.object({ type: z.literal('Scroll'), dy: z.number() }),
])
```

---

## 5. Repo layout
Per `02-architecture §10` (as amended in task 0.1): `apps/{extension,playground}`, `packages/{gesture-core,page-index,protocol}`, `fixtures/{gestures,bench}`, `docs/`, `scripts/`. Workspace package names `@gesture/{protocol,gesture-core,page-index}`. Turborepo pipeline: `build`, `test`, `lint`, `typecheck`. WXT for `apps/extension` (React), buildable skeleton only in 0A. `.github/workflows/ci.yml` runs lint + Vitest + Playwright (fake device) + extension zip.

---

## 6. Testing strategy (summary)
Vitest for protocol/gesture-core/fixtures units and the round-trip; Playwright (fake webcam y4m) for the headless bench and the extension build smoke; contract tests under `packages/protocol/test/contracts/`. Fixture-first: any threshold/filter change replays the suite. The placeholder synthetic fixture + placeholder y4m make the whole suite camera-free in CI.

## 7. Risks / open points carried into the plan
- **`gesture-core → protocol` rule edit** (§2, Q2): `.claude/rules/gesture-core.md` must add `@gesture/protocol`. Impl task + owner flag (outside this session's write scope).
- **0A bench realism**: the harness runs real MediaPipe in the *playground page* (not the extension offscreen frame-pump, which is 0B/G1); the placeholder y4m may yield few/no detections — the exit criterion is a well-formed CSV, not detection accuracy.
- **`Intent` v0 is provisional**; 1A owns the final. The plan states this so 1A does not treat it as frozen.
