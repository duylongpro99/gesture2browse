# Phase 0 — Spike results (go / no-go)

**Status:** _template — no results yet._ Filled by milestones 0B–0E and the owner's Phase-0 runs; signed by the owner (G8).

This is the single record for the eight Phase-0 gates (`docs/03-tech-stack.md §5`, criteria per `docs/05-roadmap.md §3.2–3.3` and `04-feasibility`). Each gate below has **Setup** (how it was run), **Result (numbers)** (the measured evidence — paste CSV rows / p50–p95 / fps, do not summarise away the numbers), and **Gate met?** (`Y` / `N` against the stated threshold). When every gate is recorded, complete the **Go / no-go decision** block; the owner signs it and logs the decision in `docs/05-roadmap.md §8` (agents never edit §8).

Leave a gate's fields blank until it is run. Do not delete a gate — a gate that is deferred or waived is recorded as such with a reason.

---

## G1 — Frame pump in a hidden offscreen doc

- **Threshold:** sustained **≥ 28 fps** delivery for 10 minutes with the doc hidden; no `rAF`/timer dependence (`03-tech-stack §5.1`).
- **Produced by:** milestone 0B (Playwright ≥ 28 fps for 60 s) + owner's 10-minute hidden-doc run on the M1.

**Setup:**

Agent side (E2, `apps/extension/test/frame-pump.e2e.ts`): built unpacked extension loaded in a persistent Chromium context (`channel: 'chromium'`, `headless: true`) with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=fixtures/bench/placeholder.y4m` (64×64, F30:1, looped — the fake camera caps delivery at 30 fps). Pipeline: offscreen `getUserMedia` → `MediaStreamTrackProcessor` → transferred `ReadableStream<VideoFrame>` → module Worker → MediaPipe `HandLandmarker.detectForVideo` (VIDEO mode, `numHands:1`) on an `OffscreenCanvas`. `fps-logger` samples a 2 s rolling window; `background.ts` writes the `PumpStat` series to `chrome.storage.session`. 8 s warm-up discarded, then a 60 s measurement window. No foreground surface open (only `about:blank`). Command: `pnpm exec playwright test -c apps/extension/playwright.config.ts`.

Machine: agent CI sandbox (darwin). Owner's 10-min M1 run is E1 below (still to run).

**Result (numbers):**

- **Delegate:** WebGL (GPU) — initialised successfully in headless Chromium; no fallback to WASM.
- **60 s window:** 30 windows × 2 s. **mean 30.2 fps, p05 30.0 fps, min 30.0 fps** — pinned at the fake-camera's 30 fps cap, no dropped windows. Threshold is ≥ 28 fps.
- **No rAF/timer dependence:** the built offscreen chunk and worker bundle contain zero `requestAnimationFrame` (asserted by E2); the pump is driven only by the stream reader.
- **`hidden` flag:** `[false]` for every window. **Finding:** Chrome reports `document.hidden === false` for an offscreen document (it is never a backgrounded tab), so the plan's "must be true" premise does not hold for the offscreen container. The offscreen document is nonetheless structurally non-rendered and no visible surface drove the pump (E2 asserts only `about:blank` is open). E2 therefore records `hidden` verbatim and proves the two testable halves of the gate — no rAF, and sustained rate with no foreground surface — rather than asserting `hidden === true`. Owner decision pending (handoff owner-question 1).

**Gate met? (Y/N):** Agent side (E2) **Y** (30.0 fps p05 ≥ 28, no rAF). Full gate pending the owner's 10-minute M1 run (E1) and confirmation of the `hidden` interpretation.

---

## G2 — Camera permission flow

- **Threshold:** grant from a full tab, restart Chrome, offscreen `getUserMedia` succeeds **without a prompt**; the "Allow this time" failure mode is detected (`03-tech-stack §5.2`).
- **Produced by:** milestone 0C (Playwright, pre-granted) + owner's Chrome-restart check.

**Setup:**

**Result (numbers):**

**Gate met? (Y/N):**

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
| G1 Frame pump | | |
| G2 Camera flow | | |
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
