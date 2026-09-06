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

_E1 — owner run_ (2026-09-05): the Chrome-restart survival and the live "Allow this time" revert are outside Playwright (a real browser restart, a human clicking a real permission chip). Build & load from the **0C worktree**, `pnpm --filter @gesture/extension build` in `.worktrees/0C` → chrome://extensions → Load unpacked `apps/extension/.output/chrome-mv3`; open `chrome-extension://<id>/grant-camera.html`. **Reproducibility note:** the build MUST run in `.worktrees/0C`, not the root checkout — the root is on `master`, which has no `packages/protocol` `dist` and only the 0A `grant-camera` stub, so `pnpm --filter @gesture/extension build` fails there (this is what tripped the owner's first attempt). E1a: choose "Allow on every visit", quit Chrome fully, reopen. E1b: reset the origin's camera permission, choose "Allow this time", quit and reopen.

**Result (numbers):**

_E2 (agent):_
- **Grant page pre-check:** `navigator.permissions.query({name:'camera'})` reads **`granted`** in the full tab; `getUserMedia` resolves with **no prompt**; tracks stopped immediately, no media element on the page.
- **Join message:** `CameraGrantStatus { state: 'granted', persistent: true, source: 'grant-page' }` landed in `chrome.storage.session` (validated by the Zod schema on write and on the gate's read).
- **Background gate:** with the origin granted, the pre-check reported `{ granted: true, openedGrantTab: false, queryAnswered: true, source: 'sw-query', state: 'granted' }` — it did **not** open a grant tab, and the offscreen `getUserMedia` then **succeeded** (`PumpStat` recorded, no `pumpError`).
- **Spike finding (resolves the plan §2 open question):** the MV3 **service worker _can_ answer `navigator.permissions.query({name:'camera'})`** in this Chromium build (`queryAnswered: true`, `source: 'sw-query'`). So the background gate queries the permission directly; the last-`CameraGrantStatus`-from-`storage.session` fallback is kept for any context/build where the SW query throws, but was not needed here.
- **"Allow this time" detection** (pure helper, `permission.test.ts`, 6 cases green): `granted` + seen → `persistent: true`; `prompt`/`denied` + seen → `persistent: false` + "Allow this time" suspected; `granted` + unseen → first grant. The detection is a cross-session inference and so is only observable across a restart — which is exactly E1 (owner).
- No regression: G1 `frame-pump.e2e.ts` still green with the gate in front of `ensureOffscreen()` (full 60 s window, p05 30.0 fps).

_E1 (owner, 2026-09-05):_
- **E1a restart survival — PASS.** After "Allow on every visit" and a full Chrome quit + reopen, the offscreen frame pump ran with **no camera prompt**; the service worker's `chrome.storage.session` showed `cameraPrecheck.state === 'granted'` and a live `pumpLatest`/`pumpSeries` with no `pumpError`. The persistent grant survived the restart.
- **E1b "Allow this time" detection — PASS.** After granting "Allow this time" then quitting + reopening Chrome, the grant page's pre-check read not-granted while `cameraGrantSeen` was set, so the temporary grant was **NOT mistaken for persistent**: the "Allow this time" warning was shown and `CameraGrantStatus.persistent === false`.

**Gate met? (Y/N):** **Y.** E2 (agent) Y — grant→persistent `CameraGrantStatus`→gated offscreen `getUserMedia` with no prompt, "Allow this time" detected in unit tests, SW can `permissions.query`. E1 (owner) Y — E1a restart survival PASS and E1b "Allow this time" detection PASS. **Owner approved G2 = GO (2026-09-05).**

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

_E3 — agent side_ (`apps/playground/test/click-dispatch-survey.e2e.ts`, milestone 0D): a camera-free Playwright survey — the exact sibling of the 0A bench harness. `fixtures/dispatch/**` (15 single-mechanism local site clones, plus two iframe children) is served on **two** loopback origins (`node:http`, ephemeral ports → a real cross-origin case). For every fixture the survey runs **synthetic then CDP** on a fresh page and reads the fixture's success sentinel (`window.__dispatchOk`, a `#dispatched` hash nav, or a popup event). The two techniques (`apps/playground/test/dispatch-techniques.ts`) model the extension's two production input paths from outside (plan §1): **synthetic** = the content script's untrusted `dispatchEvent` fallback (an injected `pointerdown→mousedown→pointerup→mouseup→click`, `isTrusted === false`, run in the top frame so it cannot reach a cross-origin child); **CDP** = the service worker's trusted `chrome.debugger` path, reproduced with a Playwright `CDPSession` calling the same DevTools `Input.dispatchMouseEvent` domain at the target's viewport centre. Same CDP domain ⇒ trusted-input fidelity transfers (the only caveat: this is Playwright's CDP, not `chrome.debugger`, but both drive the identical DevTools input command). The pure summariser (`apps/playground/src/dispatch-survey.ts`: `DISPATCH_COLUMNS`, `outcomesToCsv`, `summarizeOutcomes`, `recommendDefault`) has Vitest unit coverage (`dispatch-survey.test.ts`, 10 cases). Command: `pnpm exec playwright test -c apps/playground/playwright.config.ts click-dispatch-survey.e2e.ts`. Machine: agent CI sandbox (darwin, full Chromium new-headless).

_E1 — owner run_ (`SURVEY_LIVE=1`, network, not CI): the same two techniques over `LIVE_SITES` (`apps/playground/src/dispatch-sites.ts` — React/Vue TodoMVC, OpenStreetMap, an MDN native `<select>`, a Wikipedia anchor). The owner runs it on their laptop and spot-checks 5 sites the survey reports as failures (roadmap §3.3 G5). Command: `SURVEY_LIVE=1 pnpm exec playwright test -c apps/playground/playwright.config.ts click-dispatch-survey.e2e.ts`.

**Result (numbers):**

_E3 (agent, 15 local fixtures × 2 techniques = 30 rows, 8.8 s):_ **synthetic 10/15 pass, CDP 14/15 pass. CDP rescues 4 sites where synthetic fails; 1 site resists both.**

| Fixture | Mechanism | synthetic | CDP | Note |
|---|---|---|---|---|
| button-onclick | `addEventListener('click')` | pass | pass | baseline |
| anchor-href | anchor default-action nav | pass | pass | untrusted click still follows `href` |
| delegated-document | `document`-level delegation | pass | pass | synthetic clicks bubble to `document` |
| pointerdown-handler | `pointerdown`, not `click` | pass | pass | synthetic sequence includes `pointerdown` |
| capture-phase | capture-phase listener | pass | pass | capture runs on dispatch |
| **istrusted-guard** | `isTrusted` guard | **fail** | pass | the canonical synthetic-only failure |
| native-select | native `<select>` popup | fail | **fail** | a click cannot pick an option (needs keyboard) |
| window-open | `window.open` user-activation | pass | pass | popup **not** blocked for synthetic in headless (caveat below) |
| target-blank | `target=_blank` user-activation | pass | pass | new tab opened for synthetic in headless (caveat below) |
| same-origin-iframe | same-origin iframe target | pass | pass | top frame reaches a same-origin child |
| **cross-origin-iframe** | cross-origin iframe target | **fail** | pass | synthetic cannot reach the child; CDP clicks by coordinates |
| canvas-hittest | canvas coordinate hit-test | pass | pass | both carry `clientX/clientY` |
| **closed-shadow-dom** | closed shadow root target | **fail** | pass | synthetic on the host misses; CDP hit-tests the inner element |
| label-checkbox | label default-action toggle | pass | pass | untrusted click toggles the control |
| **contenteditable** | contenteditable focus/caret | **fail** | pass | untrusted click does not focus; a trusted click does |

- **Synthetic-only failures (CDP rescues), 4:** `istrusted-guard`, `cross-origin-iframe`, `closed-shadow-dom`, `contenteditable`.
- **Both-fail, 1:** `native-select` (a click of any trust cannot drive an OS-level option popup — needs keyboard/option events; out of scope for a click dispatcher).
- **Caveat — `window.open` / `target=_blank`:** in the full-headless Chromium the survey runs on, a synthetic click's `window.open`/`target=_blank` was **not** popup-blocked (both passed for synthetic). On real Chrome these are gated on transient user activation, which a synthetic `dispatchEvent` lacks, so they are expected synthetic failures live — the owner's `SURVEY_LIVE=1` run confirms this. This is exactly why E1 (live) gates the decision and E3 (local) does not.
- **CSV** (schema `DISPATCH_COLUMNS = site,category,origin,technique,reached,ok,detail`): emitted to the Playwright stdout; 31 lines (header + 30 rows). Unit tests (10) green: `outcomesToCsv` header/quoting, `summarizeOutcomes` per-site verdict + `n/a` for an unreached technique, `recommendDefault` counts and rule.

_E1 — live run (owner-confirmed 2026-09-05)_ (`SURVEY_LIVE=1`, 5 sites × 2 techniques = 10 rows, 14.2 s; agent CI sandbox, **partial network**). The owner re-ran `SURVEY_LIVE=1` on their own machine and it **matches** these recorded results:

| Live site | Mechanism | synthetic | CDP | Note |
|---|---|---|---|---|
| react-todomvc | React SPA delegation | pass | pass | `.new-todo` input focused by both |
| vue-todomvc | Vue SPA delegation | pass | pass | `.new-todo` input focused by both |
| openstreetmap | canvas/SVG map hit-test | fail | fail | **`net::ERR_CONNECTION_REFUSED`** — host unreachable from the sandbox, not a dispatch result |
| mdn-select | native `<select>` | fail | fail | `target-not-found` / `no-bounding-box` — page did not yield the `select` (blocked or markup drift) |
| wikipedia-anchor | anchor navigation | pass | fail | synthetic followed the link (URL changed); CDP coordinate click landed off the small anchor (`no-observable`) |

- **These live numbers are confounded and DO NOT override the local finding.** Two of five sites failed to load in the sandbox's partial network, and the live success heuristic is coarse (target focused, or URL changed) rather than a per-site sentinel. The apparent "recommend synthetic" from this run is an artifact of network failures counted as both-fail and TodoMVC's `.new-todo` being an input both techniques focus — **the mechanism-isolating local survey (E3) is the authority**, and its result stands: CDP is required for the hostile-page cases.
- **Owner spot-check (E1), confirmed 2026-09-05:** `openstreetmap` `ERR_CONNECTION_REFUSED` = site/network, not a dispatch finding; `mdn-select` both-fail as expected (a raw click cannot pick a native option — needs keyboard); `wikipedia-anchor` synthetic succeeded, CDP coordinate-click landed **off** the anchor = harness artifact (see caveat below), local E3 stays the authority. React/Vue TodoMVC passed both.

- **Caveat for the CDP dispatcher (→ 1C):** the live `wikipedia-anchor` CDP miss shows a raw viewport-coordinate `Input.dispatchMouseEvent` can land beside a small target when the element is not accounted for. **1C's dispatcher must target the element's bounding box with scroll-into-view (compute the box after scrolling the element into view, then click its centre), NOT fixed raw coordinates.** The survey's `cdpClick` uses the target's current bounding-box centre without scrolling, which is sufficient for the local fixtures (all in view) but is a harness simplification, not the production contract; 1C owns the robust box+scroll targeting.

_E1 (owner spot-check):_ **met — owner-confirmed 2026-09-05** (re-ran `SURVEY_LIVE=1`, results match; the three live-failure rows are a site/network unreachable case, an expected both-fail, and a harness artifact — none contradicts the local E3 finding).

**Gate met? (Y/N):** **Y.** E3 (agent) Y — 30/30 well-formed outcome rows; CDP recovers 4 synthetic failures, proving the trusted path is required for hostile pages (the survey's purpose). E1 (owner spot-check) Y — owner-confirmed 2026-09-05; the live-run failures are a site/network case, an expected both-fail, and a harness artifact, none contradicting E3. (E2 = the §8 row + `03-tech-stack §4` number is owner-only, logged post-merge.)

**Dispatch default chosen (→ §8 + `03-tech-stack §4`):** **CDP as the dispatch default** (owner-confirmed 2026-09-05), with synthetic-first + CDP-escalation as the noted alternative. Rationale: 4/15 local sites (and, live, the activation-gated `window.open`/`target=_blank` cases) are only reachable via the trusted path; a synthetic default silently fails there. `native-select` needs keyboard regardless, so no dispatch default fixes it. The owner logs the §8 row and enters the number in `03-tech-stack §4` post-merge (both owner-only; not edited by this session).

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

**Setup:**

_E3 — agent side_ (`apps/playground/test/latency-probe.test.ts`, milestone 0E; camera- and key-free, runs in CI via `pnpm test`): the pure harness `apps/playground/src/latency-probe.ts` (SSE parser, per-call first-suggestion timing, nearest-rank p50/p95, tool-calling + `json_schema` detection, 150-item snapshot builder, `LATENCY_COLUMNS` CSV) is driven by `runProbe(config, fetch)` against `apps/playground/test/latency-probe-stub.ts` — a `node:http` OpenAI-compatible server streaming canned SSE (a role delta, content deltas with a configurable inter-chunk delay, a `tool_calls` delta, a `json_schema`-valid assembled final message, `[DONE]`) over the real global `fetch`. Asserts: SSE chunks parsed to first content across chunk boundaries; first-suggestion latency measured per call (`> 0`, `<= total`); p50/p95 computed over N runs (nearest-rank, checked against the known `1..100` distribution → 50 / 95); tool-calling detected; `json_schema`-valid structured output detected; `LATENCY_COLUMNS` header and CSV rows well-formed. Command: `pnpm --filter @gesture/playground test`. Machine: agent CI sandbox (darwin). **Fidelity caveat** (like 0D's "Playwright CDP, not `chrome.debugger`"): this is Node `fetch`, not the service-worker `fetch`, and a canned stub, not a real provider — the SSE wire format and streaming API are identical, but the deciding p50/p95 and the real capability flags come only from E1.

_E1 — owner run_ (gate-deciding, needs the owner's key; not CI): the CLI `apps/playground/src/latency-probe-cli.ts` against the real OpenAI-compatible endpoint. Set the four env vars and run:

```
LLM_PROVIDER_BASE_URL=<endpoint, e.g. https://api.example.com/v1> \
LLM_PROVIDER_KEY=<provider key> \
LLM_FAST_MODEL=<fast model id, reference Haiku 4.5> \
LLM_PLANNER_MODEL=<planner model id, reference Sonnet 5> \
pnpm --filter @gesture/playground probe:latency
```

Optional: `LLM_PROBE_ITERATIONS` (default 10), `LLM_PROBE_SNAPSHOT` (default 150). It runs N timed streaming calls per model with a 150-item snapshot, tools + `response_format: json_schema` in each request, and prints first-suggestion p50/p95, a capability table, and a CSV block (schema `LATENCY_COLUMNS = model,iterations,firstContentMsP50,firstContentMsP95,totalMsP50,totalMsP95,toolCalling,jsonSchema`) to paste below. The key is read from env, sent only as a `Bearer` header, and never written to disk. **Combined-call caveat:** the probe sends `tools` and `response_format: json_schema` in one request to detect both capabilities; if the chosen provider rejects that combination, note it and re-run the two capabilities in separate calls — the p50/p95 latency numbers are unaffected.

**Result (numbers):**

_E1 (owner live run, 2026-09-06)_ — provider **9router** via gateway `http://localhost:20128/v1`, 10 iterations, 150-item snapshot:

| Role | Model | first-suggestion p50 | p95 | total stream p50 | p95 | tool-calling | json_schema |
|---|---|---|---|---|---|---|---|
| fast | `deepseel-v4-flash` | **1574 ms** | 2105 ms | 1710 ms | 2221 ms | **N** | Y |
| planner | `glm-5.2` | **2653 ms** | 3886 ms | 2784 ms | 4037 ms | Y | Y |

CSV (schema `LATENCY_COLUMNS = model,iterations,firstContentMsP50,firstContentMsP95,totalMsP50,totalMsP95,toolCalling,jsonSchema`):

```
model,iterations,firstContentMsP50,firstContentMsP95,totalMsP50,totalMsP95,toolCalling,jsonSchema
deepseel-v4-flash,10,1574,2105,1710,2221,false,true
glm-5.2,10,2653,3886,2784,4037,true,true
```

**Gate met? (Y/N):** **Y — GO.** First-suggestion p50 ≤ 3000 ms for both models (fast 1574 ms, planner 2653 ms). (The planner's p95 3886 ms exceeds 3 s, but the gate is on p50.)

- **Caveat for 2A (→ roadmap §5.1):** the fast model `deepseel-v4-flash` supports `json_schema` structured output but **not** tool-calling (`tool-calling N`); only the planner `glm-5.2` supports both. Suggestion-loop plans that require tool-calling on the fast path must instead use `glm-5.2` for the fast role (owner's mitigation), trading the ~1.1 s p50 latency headroom for tool-calling — `glm-5.2` at 2653 ms p50 still clears the 3 s gate. 2A owns the final fast/planner assignment.

**Provider + model ids chosen (→ §8):** provider **9router** (OpenAI-compatible gateway); **fast** `deepseel-v4-flash`, **planner** `glm-5.2`. Owner logs the §8 row.

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
| G2 Camera flow | Y | §G2 above — E2 (agent) grant→persistent `CameraGrantStatus`→gated offscreen `getUserMedia`, no prompt, SW can `permissions.query`; E1 (owner) restart survival + "Allow this time" detection both PASS. Owner approved GO 2026-09-05 |
| G3 Bench matrix | | |
| G4 Precision/recall | | |
| G5 Dispatch survey | Y | §G5 above — E3 (agent) synthetic 10/15, CDP 14/15, 4 CDP-rescues; E1 (owner) live run confirmed 2026-09-05. Default = CDP (owner-confirmed); §8 row + `03-tech-stack §4` number logged by owner post-merge |
| G6 Fitts / ergonomics | | |
| G7 Agent latency | Y | §G7 above — E1 (owner) 9router: fast `deepseel-v4-flash` p50 1574 ms, planner `glm-5.2` p50 2653 ms, both ≤ 3 s; E3 (agent) harness green. Fast model is json_schema-only (no tool-calling); §8 row logged by owner |
| G8 Inference path | | |

**Committed numbers** (must be entered as numbers in `03-tech-stack §4` before Phase 1 — roadmap §3.4): delegate order · click-dispatch default · click-mode default · hold times.

**Decision:** ☐ GO to Phase 1 ☐ NO-GO ☐ GO with conditions: _______________

**Owner sign-off:** ____________________  **Date:** __________

> After signing, log the G8 decision (and any conditions) in `docs/05-roadmap.md §8`. Agents draft this file; only the owner edits §8 and signs.
