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

**Files:**
- Create `apps/extension/entrypoints/offscreen/fps-logger.ts` — pure rolling-window fps accumulator.
- Create `apps/extension/entrypoints/offscreen/mediapipe.ts` — FilesetResolver + HandLandmarker init from local web_accessible_resources, delegate selection (GPU→CPU fallback).
- Create `packages/protocol/src/pump.ts` — PumpStat Zod schema + type.
- Create `apps/extension/playwright.config.ts` — extension e2e config (persistent context, --load-extension, fake-camera flags, y4m from fixtures/bench/).
- Create `apps/extension/public/models/.gitkeep` — keep the assets dir; model/wasm are copied at build, not committed.
- Modify `apps/extension/entrypoints/offscreen/main.ts` — getUserMedia → MediaStreamTrackProcessor → transfer ReadableStream + config to the Worker; receive PumpStat samples; chrome.runtime.sendMessage them to the SW.
- Modify `apps/extension/entrypoints/offscreen/inference.worker.ts` — consume the transferred ReadableStream, draw each VideoFrame to OffscreenCanvas, HandLandmarker.detectForVideo, feed fps-logger, post PumpStat. No rAF.
- Modify `apps/extension/entrypoints/background.ts` — chrome.offscreen.createDocument (reason USER_MEDIA); onMessage validates PumpStat via the protocol schema, writes the latest sample + rolling series to chrome.storage.session.
- Modify `apps/extension/wxt.config.ts` — build hook copying the root hand_landmarker.task and @mediapipe/tasks-vision WASM into the build; web_accessible_resources for /models, /wasm.
- Modify `apps/extension/package.json` — add @mediapipe/tasks-vision (dep) and @playwright/test (devDep); both already in docs/03-tech-stack.md, no new tech-stack row.
- Modify `packages/protocol/src/index.ts` — export PumpStat.
- Modify `docs/spike-results.md` — fill G1 Setup / Result (numbers) / Gate met.
- Modify `pnpm-lock.yaml` — from the two new dependencies.
- Test `apps/extension/test/frame-pump.e2e.ts` — the ≥ 28 fps / 60 s hidden-doc gate (agent verification).
- Test `apps/extension/test/fps-logger.test.ts` — fps-logger unit test.
- Test `packages/protocol/test/schemas.test.ts` — add the PumpStat schema cases (or a sibling pump.test.ts).

## Exit checks

Not frozen by this docs-only session (the lock `docs/sdd/0B/exit-checks.lock` is out of scope; the implementing/driver session freezes once the commands run). Criterion cells are verbatim: E1 from the roadmap row's **Exit** cell, E2 from its **Agent verification** cell.

| # | Criterion (verbatim) | Kind | Check |
|---|---|---|---|
| E1 | Owner's 10-minute run logged in `spike-results.md` | owner | - |
| E2 | Playwright, fake camera, doc hidden, asserts ≥ 28 fps for 60 s | mechanical | `pnpm exec playwright test -c apps/extension/playwright.config.ts` |

## Status

_Owned by the 0B session; rewritten, not appended._

**Done (session 0, plan):** wrote this plan (five questions + **Files:** block + Exit checks table).

**Done (session 2, execute):** implemented the full **Files:** block with TDD. All commands green:
- `PumpStat` schema in `packages/protocol` (schema test: valid / bad delegate / missing field). **Deviation from §3:** `delegate` reuses the existing `DelegateSchema` (`webgl`/`wasm`) instead of the plan's `GPU`/`CPU` — the protocol rule forbids synonyms and `DelegateSchema` already names this concept. MediaPipe's `GPU`/`CPU` strings are mapped in `mediapipe.ts`.
- `fps-logger.ts` pure rolling-window accumulator + unit test (6 cases).
- offscreen pump: `main.ts` (getUserMedia → `MediaStreamTrackProcessor` → transferred stream → `?worker` import), `inference.worker.ts` (stream reader → OffscreenCanvas → `detectForVideo` → fps-logger, no rAF), `mediapipe.ts` (worker-safe init, WebGL→WASM fallback).
- `background.ts` creates the offscreen doc and validates+relays `PumpStat` to `chrome.storage.session`.
- build: `wxt.config.ts` copies model+WASM via `build:publicAssets`, WAR + `wasm-unsafe-eval` CSP; deps added (mediapipe exact-pinned, playwright).
- E2 (`frame-pump.e2e.ts`): **passes** — 60 s, WebGL delegate, **p05 30.0 fps** (cap), zero rAF in bundles. Numbers in `docs/spike-results.md §G1`.

**Finding (needs owner):** an offscreen document reports `document.hidden === false` in Chrome (it is not a backgrounded tab), so the roadmap/plan premise "doc hidden ⇒ `hidden` true" does not hold. E2 records `hidden` verbatim and instead proves the gate's substance (no rAF; sustained rate with no foreground surface). Handoff owner-question 1 asks the owner to confirm this interpretation of E2/E1.

**Notable choices:** WXT's esbuild left `new Worker(new URL(...))` untransformed (worker not bundled) → switched to Vite's `?worker` import, which emits the worker chunk with MediaPipe. `browser.runtime.getURL` is path-typed to `PublicPath`; build-injected `/wasm` and `/models` are derived from the `/` origin.

**Proposed decisions for roadmap §8 (owner logs; agent does not edit §8):** G1 agent-side gate met (≥ 28 fps, 30.0 measured, WebGL, no rAF); the G1 go/no-go (G8) is logged only after the owner's 10-minute M1 run (E1) confirms it.

**Blockers:** E1 (owner's 10-minute hidden-doc run on the M1) is owner-only — steps in the handoff.

**Exit checks freeze:** the lock `docs/sdd/0B/exit-checks.lock` is out of this session's scope; the driver refreezes it (E2 command unchanged, id renamed V1→E2 per owner).

**Superpowers conflicts noted (`CLAUDE.md §6`):** none.
