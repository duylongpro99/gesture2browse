# Phase 0 — Spike results (go / no-go)

**Status:** _template — no results yet._ Filled by milestones 0B–0E and the owner's Phase-0 runs; signed by the owner (G8).

This is the single record for the eight Phase-0 gates (`docs/03-tech-stack.md §5`, criteria per `docs/05-roadmap.md §3.2–3.3` and `04-feasibility`). Each gate below has **Setup** (how it was run), **Result (numbers)** (the measured evidence — paste CSV rows / p50–p95 / fps, do not summarise away the numbers), and **Gate met?** (`Y` / `N` against the stated threshold). When every gate is recorded, complete the **Go / no-go decision** block; the owner signs it and logs the decision in `docs/05-roadmap.md §8` (agents never edit §8).

Leave a gate's fields blank until it is run. Do not delete a gate — a gate that is deferred or waived is recorded as such with a reason.

---

## G1 — Frame pump in a hidden offscreen doc

- **Threshold:** sustained **≥ 28 fps** delivery for 10 minutes with the doc hidden; no `rAF`/timer dependence (`03-tech-stack §5.1`).
- **Produced by:** milestone 0B (Playwright ≥ 28 fps for 60 s) + owner's 10-minute hidden-doc run on the M1.

**Setup:**

_E2 — agent side_ (`apps/extension/test/frame-pump.e2e.ts`): built unpacked extension loaded in a persistent Chromium context (`channel: 'chromium'`, `headless: true`) with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=fixtures/bench/placeholder.y4m` (64×64, F30:1, looped — the fake camera caps delivery at 30 fps). Pipeline: offscreen `getUserMedia` → `MediaStreamTrackProcessor` → transferred `ReadableStream<VideoFrame>` → module Worker → MediaPipe `HandLandmarker.detectForVideo` (VIDEO mode, `numHands:1`) on an `OffscreenCanvas`. `fps-logger` samples a 2 s rolling window; `background.ts` writes the `PumpStat` series to `chrome.storage.session`. 8 s warm-up discarded, then a 60 s measurement window. No foreground surface open (only `about:blank`). Command: `pnpm exec playwright test -c apps/extension/playwright.config.ts`. Machine: agent CI sandbox (darwin).

_E1 — owner run_ (2026-09-05): owner's M1, unpacked build of `apps/extension/.output/chrome-mv3` loaded via `chrome://extensions` → Load unpacked; Chrome backgrounded (no extension surface focused) for 10 minutes; fps read from the service worker's `chrome.storage.session` (`pumpSeries` / `pumpLatest`).

Camera-grant workaround the owner needed (→ **0C / G2 input**): `grant-camera.html` is still the 0A stub and an offscreen document cannot prompt for camera. To grant persistently: open `chrome-extension://<id>/grant-camera.html` in a tab, run `await navigator.mediaDevices.getUserMedia({video:true})` in its DevTools, click **Allow** (not "this time"), then reload the extension. 0C (G2) must replace the stub with a real full-tab grant flow.

**Result (numbers):**

_E2 (agent, 60 s):_
- **Delegate:** WebGL (GPU) — initialised successfully in headless Chromium; no fallback to WASM.
- **60 s window:** 30 windows × 2 s. **mean 30.2 fps, p05 30.0 fps, min 30.0 fps** — pinned at the fake-camera's 30 fps cap, no dropped windows. Threshold is ≥ 28 fps.
- **No rAF/timer dependence:** the built offscreen chunk and worker bundle contain zero `requestAnimationFrame` (asserted by E2); the pump is driven only by the stream reader.
- **`hidden` flag:** `[false]` for every window. **Finding (owner accepted reading A, 2026-09-05):** Chrome reports `document.hidden === false` for an offscreen document (it is never a backgrounded tab), so the plan's "must be true" premise does not hold for the offscreen container. The offscreen document is nonetheless structurally non-rendered and no visible surface drove the pump. E2 records `hidden` verbatim and proves the two testable halves of the gate — no rAF, and sustained rate with no foreground surface — rather than asserting `hidden === true`.

_E1 (owner, 10 min on M1):_ **30.5 fps sustained** over the 10-minute run, above the ≥ 28 fps threshold. (Owner-reported number.)

**Gate met? (Y/N):** **Y** — E2 (agent) 30.0 fps p05 ≥ 28, no rAF; E1 (owner M1) 30.5 fps sustained ≥ 28 over 10 min.

---

## G2 — Camera permission flow

- **Threshold:** grant from a full tab, restart Chrome, offscreen `getUserMedia` succeeds **without a prompt**; the "Allow this time" failure mode is detected (`03-tech-stack §5.2`).
- **Produced by:** milestone 0C (Playwright, pre-granted) + owner's Chrome-restart check.

**Setup:**

_E2 — agent side_ (`apps/extension/test/camera-grant.e2e.ts`, milestone 0C): built unpacked extension loaded in a persistent Chromium context (`channel: 'chromium'`, `headless: true`) with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=fixtures/bench/placeholder.y4m` and, crucially, **without** `--use-fake-ui-for-media-stream`. The camera is instead **pre-granted to the extension origin** via `context.grantPermissions(['camera'])`, so the flow is proved from a real origin grant rather than an auto-accepted prompt. Flow: the full-tab grant page (`grant-camera.html`) runs `navigator.permissions.query({name:'camera'})` as a pre-check, calls `getUserMedia({video:true})`, stops every track immediately (no video rendered/retained — asserted: zero `<video>`/`<canvas>` on the page), re-queries, derives the verdict with the pure helper, and writes `CameraGrantStatus` to `chrome.storage.session` + `cameraGrantSeen` to `chrome.storage.local`. The background pre-check gate (`background.ts`) then re-runs on demand (`RunCameraPrecheck`). Command: `pnpm exec playwright test -c apps/extension/playwright.config.ts camera-grant.e2e.ts`. Unit coverage: `apps/extension/test/permission.test.ts` (pure persistence/"Allow this time" derivation) and the `CameraGrantStatus` schema in `packages/protocol/test/schemas.test.ts`. Machine: agent CI sandbox (darwin).

_E1 — owner run_ (**pending**): the Chrome-restart survival and the live "Allow this time" revert are outside Playwright (a real browser restart, a human clicking a real permission chip). Steps for the owner are in the 0C handoff / below.

**Result (numbers):**

_E2 (agent):_
- **Grant page pre-check:** `navigator.permissions.query({name:'camera'})` reads **`granted`** in the full tab; `getUserMedia` resolves with **no prompt**; tracks stopped immediately, no media element on the page.
- **Join message:** `CameraGrantStatus { state: 'granted', persistent: true, source: 'grant-page' }` landed in `chrome.storage.session` (validated by the Zod schema on write and on the gate's read).
- **Background gate:** with the origin granted, the pre-check reported `{ granted: true, openedGrantTab: false, queryAnswered: true, source: 'sw-query', state: 'granted' }` — it did **not** open a grant tab, and the offscreen `getUserMedia` then **succeeded** (`PumpStat` recorded, no `pumpError`).
- **Spike finding (resolves the plan §2 open question):** the MV3 **service worker _can_ answer `navigator.permissions.query({name:'camera'})`** in this Chromium build (`queryAnswered: true`, `source: 'sw-query'`). So the background gate queries the permission directly; the last-`CameraGrantStatus`-from-`storage.session` fallback is kept for any context/build where the SW query throws, but was not needed here.
- **"Allow this time" detection** (pure helper, `permission.test.ts`, 6 cases green): `granted` + seen → `persistent: true`; `prompt`/`denied` + seen → `persistent: false` + "Allow this time" suspected; `granted` + unseen → first grant. The detection is a cross-session inference and so is only observable across a restart — which is exactly E1 (owner).
- No regression: G1 `frame-pump.e2e.ts` still green with the gate in front of `ensureOffscreen()` (full 60 s window, p05 30.0 fps).

_E1 (owner):_ _(pending — fill after the restart check below.)_

**Gate met? (Y/N):** **E2 (agent) Y** — grant→persistent status→gated offscreen `getUserMedia` with no prompt, "Allow this time" detected in unit tests. **E1 (owner) pending** — Chrome-restart survival + live "Allow this time" revert not yet run; the gate is not fully signed until E1 is recorded.

---

## G3 — Bench harness across machines

- **Threshold:** per the `04-feasibility` B3 table — WebGL vs WASM-SIMD, `GestureRecognizer` vs `HandLandmarker` + own MLP, 480p vs 720p, cold init — on M1 Air, 2020 Intel Air, and 11th-gen Xe Windows (`03-tech-stack §5.3`).
- **Produced by:** owner runs the 0A bench harness on all three machines; copies each CSV into `fixtures/bench/`.

**Setup:** _(machines, delegate/recognizer/resolution matrix; CSVs in `fixtures/bench/`)_

**Result (numbers):** _(paste the bench CSV rows or link the files; fps mean/p50/p05, inferMsP50/P95, coldInitMs per machine)_

**Gate met? (Y/N):**

---

## G4 — Landmark fixtures: precision / recall

- **Threshold:** ≥ **95 %** per-gesture precision/recall on the reduced set and **< 1 false fire / 10 min** with N-frame voting; 5 people × gestures × 3 distances (0.5 / 1.0 / 1.5 m) × 2 palm orientations, plus 30 min "no gesture" motion per person (`03-tech-stack §5.4`). Owner's own fixtures are the minimum for exit; the other four may land during 1B.
- **Produced by:** owner records the fixtures; agent trains the classifier and computes the table.

**Setup:** _(subjects recorded, distances, orientations, "none" duration)_

**Result (numbers):** _(per-gesture precision/recall table; false fires per 10 min)_

**Gate met? (Y/N):**

---

## G5 — Click-dispatch survey

- **Threshold:** survey 20 representative sites (SPA frameworks, canvas UI, iframes, native `<select>`, `window.open`); record where synthetic clicks fail. **Decision:** content-script synthetic default vs CDP default (`03-tech-stack §5.5`).
- **Produced by:** milestone 0D (Playwright survey over 20 site fixtures) + owner spot-checks 5 reported-failure sites.

**Setup:**

**Result (numbers):** _(per-site outcome table: synthetic pass/fail, CDP pass/fail; failure count)_

**Gate met? (Y/N):**

**Dispatch default chosen (→ §8 + `03-tech-stack §4`):**

---

## G6 — Fitts task (ergonomics)

- **Threshold:** ≤ **1.8 s** median acquisition at 40 px targets; **Borg CR10 ≤ 3** at 5 min elbow-supported. Snapping vs raw, pinch vs dwell (600 ms), supported vs unsupported, 5-minute blocks (`03-tech-stack §5.6`).
- **Produced by:** owner as first participant, then 2 more.

**Setup:**

**Result (numbers):** _(median acquisition time per condition; click precision; Borg CR10 ratings)_

**Gate met? (Y/N):**

**Click-mode + snapping defaults chosen (→ §8 + `03-tech-stack §4`):**

---

## G7 — Agent latency probe

- **Threshold:** first suggestion **≤ 3 s p50**; the intended provider's `fast` and `planner` models (reference Haiku 4.5 / Sonnet 5 via an OpenAI-compatible endpoint), 150-item snapshot, streamed structured output; tool-calling and `json_schema` support verified (`03-tech-stack §5.7`).
- **Produced by:** milestone 0E (runs with owner's API key).

**Setup:** _(provider + endpoint; fast/planner model ids; snapshot size)_

**Result (numbers):** _(first-suggestion p50/p95; tool-calling Y/N; json_schema Y/N)_

**Gate met? (Y/N):**

**Provider + model ids chosen (→ §8):**

---

## G8 — Go / no-go: browser inference vs ONNX-Web fallback

- **Threshold:** decide browser inference vs ONNX-Web fallback; **document the 2020 Intel Air result explicitly** (`03-tech-stack §5.8`).
- **Produced by:** owner reads this document and signs the decision below.

**Setup:**

**Result (numbers):** _(2020 Intel Air fps/inference figures called out explicitly)_

**Gate met? (Y/N):**

---

## Go / no-go decision

| Gate | Met? (Y/N) | Evidence (section above / file) |
|---|---|---|
| G1 Frame pump | Y | §G1 above — E2 30.0 fps p05 (WebGL, no rAF); E1 owner M1 30.5 fps / 10 min |
| G2 Camera flow | E2 Y; E1 pending | §G2 above — E2 (agent) grant→persistent `CameraGrantStatus`→gated offscreen `getUserMedia`, no prompt; SW can `permissions.query`. E1 (owner Chrome-restart) pending |
| G3 Bench matrix | | |
| G4 Precision/recall | | |
| G5 Dispatch survey | | |
| G6 Fitts / ergonomics | | |
| G7 Agent latency | | |
| G8 Inference path | | |

**Committed numbers** (must be entered as numbers in `03-tech-stack §4` before Phase 1 — roadmap §3.4): delegate order · click-dispatch default · click-mode default · hold times.

**Decision:** ☐ GO to Phase 1 ☐ NO-GO ☐ GO with conditions: _______________

**Owner sign-off:** ____________________  **Date:** __________

> After signing, log the G8 decision (and any conditions) in `docs/05-roadmap.md §8`. Agents draft this file; only the owner edits §8 and signs.
