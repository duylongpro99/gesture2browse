# Gesture Browser Agent — Tech Stack

**Status:** Draft v0.1 · **Date:** 2026-09-04

Principle: TypeScript end to end, on-device perception, a provider-agnostic agent that speaks the OpenAI-compatible API to any endpoint the user configures, and no server for the MVP.

## 1. Stack by layer

| Layer | Choice | Alternatives considered | Why this one |
|---|---|---|---|
| **Hand tracking** | `@mediapipe/tasks-vision` — `HandLandmarker` (21 landmarks) in VIDEO mode, **WebGL delegate** (no WebGPU — it does not exist in tasks-vision); `GestureRecognizer` kept only as an interim reference | TensorFlow.js HandPose/MediaPipe Hands legacy; ONNX Runtime Web with a custom model (WebGPU escape hatch, reserve); WebXR hand input (needs headset) | Maintained, ships WASM + WebGL delegates and plain-JSON landmark output. The gesture MLP is tiny and slower on GPU than CPU, so we run our own classifier over the landmarks (04-feasibility A3/B4). Legacy TF.js solutions are deprecated. |
| **Gesture classification (core, MVP)** | Own in-browser classifier: MLP (kNN placeholder in Phase 0) over wrist-centred, scale-normalized landmarks, with a **mandatory "none" class** trained on natural motion; palm-facing gate, 3-frame vote, score ≥ 0.6. Per-user custom gestures (Phase 3) use the same path | MediaPipe Model Maker (Python, offline, "no longer actively maintained") | ~1 ms on CPU, same accuracy class as the canned head, trainable per user with 10–20 samples, and the "none" class cut false positives ~6× in HaGRIDv2. Retires the Model Maker dependency. |
| **Pointer smoothing** | 1€ filter (own implementation, ~40 lines) | Kalman, double-exponential, moving average | Best jitter/lag trade-off for interactive pointing; two intuitive parameters exposed in calibration. |
| **Gesture state machine** | XState v5 | Hand-rolled switch statements; RxJS | Explicit states, timers, guards, and visualizer; model-based testing; transitions are serializable for replay. |
| **Extension framework** | WXT (Vite-based, MV3, TypeScript) | Plasmo; CRXJS; raw Vite | WXT has first-class offscreen/side-panel entrypoints, HMR, auto-manifest, cross-browser builds (Firefox later). |
| **Language / runtime** | TypeScript 7.x (native compiler) strict everywhere; Node 24 LTS for the companion | Python companion | One language across extension, shared packages, and companion; the agent loop is plain `fetch` + JSON, so no vendor SDK is needed. |
| **UI (side panel, onboarding)** | React 19 + Tailwind CSS 4 + Radix primitives | Preact, Svelte, Lit | Team familiarity and ecosystem; side panel is a small app, bundle size is not critical there. |
| **Cursor overlay (content script)** | Vanilla TS + Shadow DOM, no framework | React in content script | Must be tiny and fast, injected into every frame; a framework buys nothing for one animated div and a ring. |
| **Interactable index & snapping** | Own package (`page-index`) with `MutationObserver`, `IntersectionObserver`, grid spatial hashing | Playwright-style locator heuristics; Vimium hint algorithms (reference) | Needs per-frame hit-testing, which generic locator code does not provide; Vimium's clickable-element heuristics are a good starting list. |
| **Input dispatch** | **Hybrid**: content-script synthetic events by default; `chrome.debugger` → CDP (`Input.dispatchMouseEvent/KeyEvent`, `Page.captureScreenshot`) only in opt-in trusted-click mode or for targets needing user activation | CDP-primary; content-script only; Playwright (cannot run inside an extension) | The debugger infobar is unavoidable and forces manual Web Store review (04-feasibility B1), so CDP is opt-in. `debugger` is an optional permission. Phase 0 G5 measures where synthetic clicks fail. |
| **Extension ↔ companion (Phase 3, optional)** | Chrome Native Messaging (stdio, JSON) — only when a companion is installed for OS keychain / on-device models / OS pointer | Local WebSocket server; HTTP | No open ports, Chrome authenticates the host by manifest, works without network. The MVP ships no companion; the agent loop runs in the service worker. |
| **Agent runtime** | Own `agent-core` package: a small tool-use loop over the **OpenAI-compatible Chat Completions API** (`/v1/chat/completions` with `tools`, `tool_choice`, streaming SSE, `response_format: json_schema`); thin fetch client, no vendor SDK | `openai` npm SDK with `baseURL` (works, but needs `dangerouslyAllowBrowser` and adds bundle weight); Vercel AI SDK + `@ai-sdk/openai-compatible`; Claude Agent SDK (rejected: 200 MB binary, ToS, Anthropic-only); Browser Use / Stagehand (Playwright, cannot drive the live tab from an extension) | The loop is eight flat tools and a `while (finish_reason === "tool_calls")`; owning it keeps the service-worker bundle small, gives full control over retries, cancellation, and the confirmation gate, and binds us to a wire format that every provider speaks rather than to one vendor. |
| **LLM provider** | **Custom provider, user-configured**: `baseURL` + API key + two model ids, `fast` (suggestion ranking, single steps) and `planner` (multi-step tasks). Any OpenAI-compatible endpoint qualifies: the team's own gateway, OpenRouter, Anthropic/Gemini/Mistral compatibility endpoints, or local vLLM / Ollama / LM Studio | Hard-wiring one vendor (Anthropic or OpenAI) | The user or deployer picks the model and pays for it; a local endpoint keeps page content on-device; provider changes need no code change. Presets ship for common endpoints, and a **capability probe** at setup checks tool calling, streaming, and JSON-schema output so the agent degrades gracefully (e.g. JSON-in-text fallback) on endpoints that miss one. |
| **Page representation for the agent** | Compact interactable/a11y JSON (ids shared with snapping) + optional PNG screenshot via CDP | Full DOM/HTML dump; screenshot-only | 10–50× fewer tokens than HTML; ids make actions unambiguous; screenshot fills gaps on canvas/visual UIs. |
| **WebMCP (Phase 3)** | Consume `navigator.modelContext` tools when a site exposes them | — | Structured, low-token, site-sanctioned actions; Chrome origin trial in 2026. |
| **Voice (Phase 2)** | On-device Web Speech (Chrome 139+ `processLocally: true`) first; cloud Web Speech fallback behind consent; on-device Whisper-class via `@huggingface/transformers` (WebGPU) only for custom vocabulary | Cloud STT APIs | On-device Web Speech is zero-setup and matches the privacy stance (04-feasibility Tier C); macOS has an open Chrome bug to watch. |
| **Storage** | `chrome.storage.sync` (settings, gesture map), `chrome.storage.local` (calibration, diagnostics, provider config without the key), `chrome.storage.session` (API key while the browser runs, optional persist to `local` after a plain disclosure), IndexedDB (custom gesture samples), OS keychain via the optional companion when installed | — | Right scope for each datum; the key never leaves the service worker and is never sent to any host other than the configured `baseURL`. |
| **Schema / validation** | Zod for every cross-boundary message (port, native messaging, storage) | io-ts, Valibot | Runtime validation at trust boundaries; shared types. |
| **Testing** | Vitest (unit, FSM, filter, snapping in happy-dom); Playwright (e2e with unpacked extension + fake webcam y4m); XState model-based tests; recorded landmark fixtures | Jest, Puppeteer | Fast unit loop; e2e with real Chromium and deterministic fake camera. |
| **Build / monorepo** | pnpm workspaces + Turborepo; Vite (v8, rolldown) via WXT; tsup for `packages/*` JS bundle + `tsc --emitDeclarationOnly` for its `.d.ts` (tsup's bundled `rollup-plugin-dts` cannot read the TS 7 compiler API) | Nx, Bazel | Light, standard, fast. |
| **Quality** | Biome v2 (lint + format; TypeScript 7-compatible), Husky + lint-staged, Changesets | ESLint + typescript-eslint + Prettier (dropped: typescript-eslint caps at `typescript <6.1.0`, incompatible with TS 7) | One tool for lint and format, and the only mature linter that supports the TS 7 native compiler today. |
| **CI** | GitHub Actions: lint, unit, e2e (Linux Chromium headless-new with fake camera), perf smoke (fps/timings on fixture video), extension zip artifact | — | Everything runs in CI without a physical camera because of y4m fake capture. |
| **Distribution** | Chrome Web Store (extension); signed installers (macOS `.pkg` notarized, Windows MSI) for the companion, registering the native messaging manifest | Self-hosted CRX (blocked by Chrome policy) | Store for reach; companion only needed for agent features. |
| **Telemetry (opt-in)** | Local ring-buffer diagnostics with export; optional anonymized counters to a minimal endpoint later | Full analytics SDK | Privacy posture; MVP does not need a backend. |

## 2. Key dependencies and versions (as of September 2026)

| Package | Purpose | Notes |
|---|---|---|
| `@mediapipe/tasks-vision` | Landmarks + gestures | Pin exact version; ship WASM files locally under `public/`, do not load from CDN (CSP, offline). |
| `xstate` ^5 | FSM | Use `setup()` typed actors. |
| `wxt` | Extension build | `wxt build -b chrome`, `-b firefox` later. |
| `react` ^19, `react-dom` | Side panel | |
| `tailwindcss` ^4 | Styling | |
| `@radix-ui/*` | Accessible primitives | Dialog, Slider, Switch for settings. |
| `zod` ^3/^4 | Schemas | |
| *(none for LLM)* | `agent-core` talks to the OpenAI-compatible API over `fetch` + `ReadableStream` SSE parsing | Tool schemas generated from Zod via `z.toJSONSchema()` (Zod 4) so the same schema validates the model's arguments. `openai` SDK stays an option if the hand-rolled client grows past ~300 lines. |
| `vitest`, `@playwright/test`, `happy-dom` | Tests | |
| `@huggingface/transformers` (Phase 2, optional) | On-device speech | WebGPU Whisper-class model. |

## 3. Browser and hardware requirements

- Chrome/Chromium 128+ (offscreen `USER_MEDIA`, side panel). Chrome 139+ for on-device speech (Phase 2). Edge, Brave, Arc by inheritance. No WebGPU dependency.
- Webcam 640×480 @ 30 fps (built-in laptop cameras qualify); higher resolutions supported but do not improve inference.
- GPU: any 2019+ integrated GPU with WebGL2; WASM-SIMD CPU fallback at 20 fps.
- Companion (Phase 3, optional): macOS 13+, Windows 10+, Linux x64; Node bundled in the installer.

## 4. Configuration and tuning defaults

| Parameter | Default | Range | Where set |
|---|---|---|---|
| Camera resolution | 640×480 | 640×480–1920×1080 | Settings (higher does not improve inference) |
| Inference fps | 30 (15 idle) | 15–60 | Auto |
| 1€ `min_cutoff` / `beta` (landmarks 0,4,8,9 + pointer) | 1.0 Hz / 0.007 | 0.3–3 / 0–0.05 | Calibration slider ("steady ↔ responsive") |
| Pinch in / out threshold | 0.25 / 0.35 × dist(0,9) | 0.2–0.6 | Calibration |
| Pinch release debounce | 100 ms | 80–120 | Fixed |
| Tap max duration | 300 ms | 150–500 | Settings |
| Stable-tracking gate before any gesture fires | 300 ms | — | Fixed |
| Hold gesture time | 600 ms (Victory) / 700–800 ms (Thumbs) / 1000 ms (Palm clutch) | 300–1500 | Settings |
| Dwell-click time | 600 ms | 500–1000 | Calibration (Accessibility profile default) |
| Swipe velocity / distance | 1.5 units/s / 0.25 units | — | Settings, off in Accessibility profile |
| Snap radius | 48 CSS px | 0 (off)–96 | Settings |
| Pointer gain (active box → viewport) | 1.6 | 1.0–3.0 | Calibration |
| Classifier score gate | score ≥ 0.6 for 3 frames | — | Fixed |
| Agent snapshot cap | 150 items | — | Fixed |
| Guarded-action confirm timeout | 15 s | — | Fixed |

## 5. Phase-0 spike (go/no-go gates)

Milestone mapping and exit gates are in `05-roadmap.md §3`; this is the technical checklist.

1. **Frame pump in a hidden offscreen doc** (G1): `MediaStreamTrackProcessor` → transferred stream → Worker → MediaPipe at 30 fps for 10 minutes with the doc hidden. Gate: sustained ≥ 28 fps delivery, no `rAF`/timer dependence.
2. **Camera permission flow** (G2): grant from a full tab, restart Chrome, confirm offscreen `getUserMedia` succeeds without prompt; verify "Allow this time" failure mode is detected.
3. **Bench harness** (G3) on M1 Air, 2020 Intel Air, 11th-gen Xe Windows: WebGL vs WASM-SIMD, `GestureRecognizer` vs `HandLandmarker` + own MLP, 480p vs 720p, cold init time. Gate: per 04-feasibility B3 table.
4. **Landmark fixtures** (G4): 5 people × gestures × 3 distances (0.5 / 1.0 / 1.5 m) × 2 palm orientations, plus 30 min of "no gesture" natural motion per person. Compute per-gesture precision/recall and false fires per 10 min with N-frame voting. Gate: ≥ 95 % on the reduced set, < 1 false fire / 10 min.
5. **Click dispatch survey** (G5): 20 representative sites (SPA frameworks, canvas UI, iframes, native `<select>`, `window.open`). Record where synthetic clicks fail. Decision: content-script default vs CDP default.
6. **Fitts task** (G6) with snapping vs raw, pinch vs dwell (600 ms), elbow-supported vs unsupported, 5-minute blocks with Borg CR10 ratings. Gate: ≤ 1.8 s median at 40 px targets; Borg ≤ 3 at 5 min supported.
7. **Agent latency probe** (G7): the intended provider's `fast` and `planner` models (reference: Haiku 4.5 / Sonnet 5 via an OpenAI-compatible endpoint), 150-item snapshot, streamed structured output; also verifies tool calling and `json_schema` support. Gate: first suggestion ≤ 3 s p50.
8. **Go/no-go** (G8) on browser inference vs ONNX-Web fallback; document the 2020 Intel Air result explicitly.

## 6. What this stack deliberately avoids

- **A backend for the MVP.** Everything runs on the user's machine; a backend appears only for optional sync/telemetry or a hosted agent tier.
- **Playwright/Puppeteer in production.** They own a browser; we live inside the user's. CDP via `chrome.debugger` gives the same primitives.
- **Loading models or WASM from CDNs at runtime.** Ship them in the extension for CSP, offline, and store-review reasons.
- **Raw video anywhere except the offscreen document.** Not in the side panel preview (skeleton only by default), not in storage, not to the agent.
- **Autonomous agent execution of guarded actions.** Confirmation is a hardware-adjacent signal (camera or keyboard), never a model output.
- **Vendor-specific LLM SDKs and features.** Everything the agent needs (tool calling, streaming, structured output) is expressed in the OpenAI-compatible wire format. Vendor extras (Anthropic prompt caching headers, OpenAI Responses API, Gemini-only fields) are exposed only as optional per-preset hints, never as a dependency.
