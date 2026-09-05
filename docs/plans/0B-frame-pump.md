# 0B — Frame pump (gate G1) — Plan

**Milestone:** 0B (`docs/05-roadmap.md §3.2`) · **Branch:** `0B` · **Base:** `master` (0A scaffold present) · **Date:** 2026-09-05
**Spec / impl:** none yet — this spike is small enough that the five questions below plus the **Files:** block are the whole design. `obra-test-driven-development` drives the code; the roadmap row's agent verification is the failing test.

Gate G1 (`docs/03-tech-stack.md §5.1`): the offscreen document pumps camera frames
`getUserMedia` → `MediaStreamTrackProcessor` → transferred `ReadableStream<VideoFrame>` → Worker → MediaPipe `HandLandmarker.detectForVideo` on an `OffscreenCanvas`, sustaining **≥ 28 fps with the document hidden and no `rAF`/timer dependence**. The pump path is durable: 1B (plan input "G1 frame pump path") extends this worker with the classifier; 1D.5 diagnostics surface the same fps.

## 1. Placement

**One owner: the offscreen document** (`apps/extension/entrypoints/offscreen/**`, `.claude/rules/offscreen.md`). It owns the camera, the `MediaStreamTrackProcessor`, the Worker, `OffscreenCanvas`, and MediaPipe. The 0A stubs (`main.ts`, `inference.worker.ts`) name 0B/G1 as their filler.

The service worker (`background.ts`) is a second component, touched only for what the offscreen API forces there: it **creates** the offscreen document (`chrome.offscreen.createDocument`) and **surfaces** the fps readout, because `.claude/rules/offscreen.md` forbids the offscreen doc from touching `chrome.storage`. The message that joins the two is a new `protocol` schema **`PumpStat`** (offscreen → SW fps telemetry) — see §3. No content script, no side panel, no gesture-core, no FSM (0B measures throughput only; gesture timing is not introduced here).

## 2. Boundary check

| Component | Imports / runtime APIs | Allowed by rule? |
|---|---|---|
| offscreen | `@mediapipe/tasks-vision`, `getUserMedia`, `MediaStreamTrackProcessor`, `ReadableStream`/`transfer`, `Worker`, `OffscreenCanvas`, `VideoFrame`, `chrome.runtime.sendMessage`, `@gesture/protocol` | ✓ rule allows `@mediapipe/tasks-vision`, `protocol`, runtime Port. **No** network (wasm+model served as local web-accessible resources, no CDN — tech-stack §2/§6), **no** `chrome.storage`, **no** `chrome.debugger`, **no** frame/video export (VideoFrame + OffscreenCanvas stay inside the worker; only the numeric `PumpStat` leaves), **no** gesture timing. |
| background | `chrome.offscreen.createDocument`, `chrome.runtime.onMessage`, `chrome.storage.session`, `@gesture/protocol` | ✓ rule allows `chrome.*`, `protocol`; must validate every inbound message with the protocol Zod schema (§3); `storage.session` fps is not a secret (the "never" is secrets in `storage.local/sync`). |
| protocol | `zod` only | ✓ |

Boundary-lint (0A Task 7): `VideoFrame`/`ImageBitmap` are permitted only under `entrypoints/offscreen/` — the worker lives there. ✓ No new gesture-timing constant is introduced, so the timing-constant lint is untouched. All packages consumed via `package.json` `exports`; no deep imports.

**MediaPipe assets.** The 7.5 MB `hand_landmarker.task` already committed at the repo root, plus the `@mediapipe/tasks-vision` WASM, are copied into the extension build by a `wxt.config.ts` build hook and exposed as `web_accessible_resources` under `/models` and `/wasm`; `FilesetResolver.forVisionTasks(chrome.runtime.getURL('wasm'))` loads them. No duplicate binary is committed (only `public/models/.gitkeep`), no CDN fetch.

## 3. Interfaces touched

Adds **one** Zod schema to `packages/protocol` — the offscreen → SW telemetry message, defined in protocol first, then both sides:

```
PumpStat = {
  ts: number;            // performance.now() in the worker at window close
  fps: number;           // frames delivered in the last window / windowSec
  frames: number;        // frames in the window
  windowMs: number;      // window length
  delegate: 'GPU' | 'CPU';   // WebGL (GPU) or WASM-SIMD (CPU) MediaPipe delegate
  hidden: boolean;       // document.hidden at sample time (must be true in the gate)
}
```

Does **not** touch `GestureFrame` v0, `FixtureRecord`, `Intent`, or `BENCH_COLUMNS` (all fixed by 0A; 0B only consumes the model/pipeline, not those shapes). `PumpStat` is spike/diagnostic-scoped: 1B may fold classifier fps into it and 1D.5 may extend it; 0B fixes no shared interface with a downstream milestone (the roadmap row has no "Interfaces fixed here").

## 4. Principle check (`docs/02-architecture.md §1`)

- **Two loops, two speeds** — 0B builds the fast-loop capture primitive; the pump is driven by the `MediaStreamTrackProcessor` reader (frames pulled as the camera produces them), never by `rAF`/`setTimeout`, so it survives a hidden document. ✓
- **Video stays in one process** — `VideoFrame`, `OffscreenCanvas`, and landmarks never leave the worker; only the numeric `PumpStat` crosses to the SW, enforced by boundary-lint. ✓
- **Replaceable parts** — MediaPipe delegate (GPU/CPU) is selectable at init; the pump is decoupled from detection (the worker runs `detectForVideo` but discards results in 0B — 1B consumes them), and `fps-logger` is a pure function. ✓
- **Page is hostile / Agent proposes, human disposes** — N/A (no page or agent code in 0B).

## 5. Tests

- **`fps-logger.test.ts`** (unit, Vitest): rolling-window fps math — window rollover, empty window, exact-boundary counts.
- **`pump` schema test** (Vitest, in protocol): `PumpStatSchema` accepts a valid sample, rejects a bad `delegate`, rejects a missing field.
- **`frame-pump.e2e.ts`** (Playwright, the roadmap row's agent verification): loads the built unpacked extension with the fake camera flags, lets `background.ts` create the offscreen document, keeps every extension surface hidden/backgrounded, and reads the `PumpStat` series from `chrome.storage.session` via the service worker. **Asserts sustained ≥ 28 fps over a 60 s window with `hidden: true` throughout.** A shorter warm-up window is discarded (model cold-init). Fixture-first: the y4m fake camera under `fixtures/bench/` is the eyes; no real camera.
- Numbers (mean/p05/p50 fps, cold-init ms, delegate) recorded in `docs/spike-results.md` under **G1**.

## Files

**Create**
- `apps/extension/entrypoints/offscreen/fps-logger.ts` — pure rolling-window fps accumulator.
- `apps/extension/entrypoints/offscreen/mediapipe.ts` — `FilesetResolver` + `HandLandmarker` init from local `web_accessible_resources`, delegate selection (GPU→CPU fallback).
- `packages/protocol/src/pump.ts` — `PumpStat` Zod schema + type.
- `apps/extension/playwright.config.ts` — extension e2e config (persistent context, `--load-extension`, fake-camera flags, y4m from `fixtures/bench/`).
- `apps/extension/test/frame-pump.e2e.ts` — the ≥ 28 fps / 60 s hidden-doc gate (agent verification).
- `apps/extension/test/fps-logger.test.ts` — fps-logger unit test.
- `apps/extension/public/models/.gitkeep` — keep the assets dir; model/wasm are copied at build, not committed.

**Modify**
- `apps/extension/entrypoints/offscreen/main.ts` — `getUserMedia` → `MediaStreamTrackProcessor` → transfer `ReadableStream` + config to the Worker; receive `PumpStat` samples; `chrome.runtime.sendMessage` them to the SW.
- `apps/extension/entrypoints/offscreen/inference.worker.ts` — consume the transferred `ReadableStream`, draw each `VideoFrame` to `OffscreenCanvas`, `HandLandmarker.detectForVideo`, feed `fps-logger`, post `PumpStat`. No `rAF`.
- `apps/extension/entrypoints/background.ts` — `chrome.offscreen.createDocument` (reason `USER_MEDIA`); `onMessage` validates `PumpStat` via the protocol schema, writes the latest sample + rolling series to `chrome.storage.session`.
- `apps/extension/wxt.config.ts` — build hook copying the root `hand_landmarker.task` and `@mediapipe/tasks-vision` WASM into the build; `web_accessible_resources` for `/models`, `/wasm`.
- `apps/extension/package.json` — add `@mediapipe/tasks-vision` (dep) and `@playwright/test` (devDep).
- `packages/protocol/src/index.ts` — export `PumpStat`.
- `packages/protocol/test/schemas.test.ts` — add the `PumpStat` schema cases (or a sibling `pump.test.ts`).
- `docs/spike-results.md` — fill **G1** Setup / Result (numbers) / Gate met.
- `pnpm-lock.yaml` — from the two new dependencies.

**Test** — `apps/extension/test/frame-pump.e2e.ts`, `apps/extension/test/fps-logger.test.ts`, the `PumpStat` cases in `packages/protocol/test/`.

New runtime dependency: `@mediapipe/tasks-vision` is already listed in `docs/03-tech-stack.md` (used by the playground bench in 0A); no new tech-stack row is needed. `@playwright/test` is dev-only and already in the stack.

## Exit checks

Not frozen by this docs-only session (the lock `docs/sdd/0B/exit-checks.lock` is out of scope; the implementing/driver session freezes once the commands run). Criterion cells are verbatim: E1 from the roadmap row's **Exit** cell, V1 from its **Agent verification** cell.

| # | Criterion (verbatim) | Kind | Check |
|---|---|---|---|
| E1 | Owner's 10-minute run logged in `spike-results.md` | owner | - |
| V1 | Playwright, fake camera, doc hidden, asserts ≥ 28 fps for 60 s | mechanical | `pnpm exec playwright test -c apps/extension/playwright.config.ts` |

## Status

_Owned by the 0B session; rewritten, not appended._

**Done (session 0, plan):**
- Read the §3.2 row, `03-tech-stack §5.1` (G1 threshold), `02-architecture §6` (`GestureFrame`), the 0A interfaces (`GestureFrame` v0, `FixtureRecord`, `BENCH_COLUMNS`), and the `offscreen`/`background`/`protocol` rules.
- Wrote this plan (five questions + **Files:** block + Exit checks table). No open question required a brainstorm.

**In progress:** none.

**Next (session 1, execute):** implement the **Files:** block with `obra-test-driven-development` — protocol `PumpStat` first, then the offscreen pump + worker + `fps-logger`, then `background.ts` relay, then the Playwright extension e2e (V1). Record numbers in `docs/spike-results.md §G1`.

**Proposed decisions for roadmap §8 (owner logs; agent does not edit §8):** none yet — the G1 go/no-go (G8) is logged only after the owner's 10-minute run confirms the agent's ≥ 28 fps number.

**Blockers:** the milestone Exit (E1) is owner-only — the owner's 10-minute hidden-doc run on the M1. Surfaced at execute time as a `NEEDS-OWNER` handoff with exact steps.

**Superpowers conflicts noted (`CLAUDE.md §6`):** none.
