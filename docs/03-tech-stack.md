# Gesture Browser Agent — Tech Stack

**Status:** Draft v0.1 · **Date:** 2026-09-04

Principle: TypeScript end to end, on-device perception, a provider-agnostic agent that speaks the OpenAI-compatible API to any endpoint the user configures, and no server for the MVP.

## 1. Stack by layer

| Layer | Choice | Alternatives considered | Why this one |
|---|---|---|---|
| **Hand tracking & gesture classification** | `@mediapipe/tasks-vision` — `GestureRecognizer` (21 landmarks + 7 canned gestures) in VIDEO mode, GPU delegate | TensorFlow.js HandPose/MediaPipe Hands legacy; ONNX Runtime Web with a custom model; WebXR hand input (needs headset) | Maintained, ships WASM + WebGPU/WebGL delegates, gives landmarks and gesture labels in one call, extendable with custom `.task` bundles. Legacy TF.js solutions are deprecated. |
| **Custom gestures (Phase 3)** | MediaPipe Model Maker (Python, offline) → `.task`; or a tiny landmark MLP trained in-browser with TensorFlow.js and stored in IndexedDB | Full retrain of the hand model | Model Maker keeps the canned classifier and adds classes; the in-browser MLP allows per-user gestures with 10–20 samples and no Python. |
| **Pointer smoothing** | 1€ filter (own implementation, ~40 lines) | Kalman, double-exponential, moving average | Best jitter/lag trade-off for interactive pointing; two intuitive parameters exposed in calibration. |
| **Gesture state machine** | XState v5 | Hand-rolled switch statements; RxJS | Explicit states, timers, guards, and visualizer; model-based testing; transitions are serializable for replay. |
| **Extension framework** | WXT (Vite-based, MV3, TypeScript) | Plasmo; CRXJS; raw Vite | WXT has first-class offscreen/side-panel entrypoints, HMR, auto-manifest, cross-browser builds (Firefox later). |
| **Language / runtime** | TypeScript 5.x strict everywhere; Node 24 LTS for the companion | Python companion | One language across extension, shared packages, and companion; the agent loop is plain `fetch` + JSON, so no vendor SDK is needed. |
| **UI (side panel, onboarding)** | React 19 + Tailwind CSS 4 + Radix primitives | Preact, Svelte, Lit | Team familiarity and ecosystem; side panel is a small app, bundle size is not critical there. |
| **Cursor overlay (content script)** | Vanilla TS + Shadow DOM, no framework | React in content script | Must be tiny and fast, injected into every frame; a framework buys nothing for one animated div and a ring. |
| **Interactable index & snapping** | Own package (`page-index`) with `MutationObserver`, `IntersectionObserver`, grid spatial hashing | Playwright-style locator heuristics; Vimium hint algorithms (reference) | Needs per-frame hit-testing, which generic locator code does not provide; Vimium's clickable-element heuristics are a good starting list. |
| **Trusted input** | `chrome.debugger` → CDP `Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`, `Input.synthesizeScrollGesture`, `Page.captureScreenshot` | Content-script synthetic events only; Playwright (cannot run inside an extension) | Real, `isTrusted` events; screenshots for the agent from the same channel. Content-script events remain the fallback. |
| **Extension ↔ companion** | Chrome Native Messaging (stdio, JSON) | Local WebSocket server; HTTP | No open ports, Chrome authenticates the host by manifest, works without network. |
| **Agent runtime** | Own `agent-core` package: a small tool-use loop over the **OpenAI-compatible Chat Completions API** (`/v1/chat/completions` with `tools`, `tool_choice`, streaming SSE, `response_format: json_schema`); thin fetch client, no vendor SDK | `openai` npm SDK with `baseURL` (works, but needs `dangerouslyAllowBrowser` and adds bundle weight); Vercel AI SDK + `@ai-sdk/openai-compatible`; Claude Agent SDK (rejected: 200 MB binary, ToS, Anthropic-only); Browser Use / Stagehand (Playwright, cannot drive the live tab from an extension) | The loop is eight flat tools and a `while (finish_reason === "tool_calls")`; owning it keeps the service-worker bundle small, gives full control over retries, cancellation, and the confirmation gate, and binds us to a wire format that every provider speaks rather than to one vendor. |
| **LLM provider** | **Custom provider, user-configured**: `baseURL` + API key + two model ids, `fast` (suggestion ranking, single steps) and `planner` (multi-step tasks). Any OpenAI-compatible endpoint qualifies: the team's own gateway, OpenRouter, Anthropic/Gemini/Mistral compatibility endpoints, or local vLLM / Ollama / LM Studio | Hard-wiring one vendor (Anthropic or OpenAI) | The user or deployer picks the model and pays for it; a local endpoint keeps page content on-device; provider changes need no code change. Presets ship for common endpoints, and a **capability probe** at setup checks tool calling, streaming, and JSON-schema output so the agent degrades gracefully (e.g. JSON-in-text fallback) on endpoints that miss one. |
| **Page representation for the agent** | Compact interactable/a11y JSON (ids shared with snapping) + optional PNG screenshot via CDP | Full DOM/HTML dump; screenshot-only | 10–50× fewer tokens than HTML; ids make actions unambiguous; screenshot fills gaps on canvas/visual UIs. |
| **WebMCP (Phase 3)** | Consume `navigator.modelContext` tools when a site exposes them | — | Structured, low-token, site-sanctioned actions; Chrome origin trial in 2026. |
| **Voice (Phase 2)** | Web Speech API first; on-device Whisper-class via `@huggingface/transformers` (WebGPU) as privacy option | Cloud STT APIs | Web Speech is zero-setup; on-device option matches the privacy stance. |
| **Storage** | `chrome.storage.sync` (settings, gesture map), `chrome.storage.local` (calibration, diagnostics, provider config without the key), `chrome.storage.session` (API key while the browser runs, optional persist to `local` after a plain disclosure), IndexedDB (custom gesture samples), OS keychain via the optional companion when installed | — | Right scope for each datum; the key never leaves the service worker and is never sent to any host other than the configured `baseURL`. |
| **Schema / validation** | Zod for every cross-boundary message (port, native messaging, storage) | io-ts, Valibot | Runtime validation at trust boundaries; shared types. |
| **Testing** | Vitest (unit, FSM, filter, snapping in happy-dom); Playwright (e2e with unpacked extension + fake webcam y4m); XState model-based tests; recorded landmark fixtures | Jest, Puppeteer | Fast unit loop; e2e with real Chromium and deterministic fake camera. |
| **Build / monorepo** | pnpm workspaces + Turborepo; Vite via WXT; tsup for `packages/*` and the companion | Nx, Bazel | Light, standard, fast. |
| **Quality** | ESLint (typescript-eslint), Prettier, Biome optional, Husky + lint-staged, Changesets | — | Standard. |
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

- Chrome/Chromium 128+ (offscreen `USER_MEDIA`, side panel, WebGPU stable). Edge, Brave, Arc by inheritance.
- Webcam 720p @ 30 fps (built-in laptop cameras qualify).
- GPU: any 2019+ integrated GPU; CPU fallback at 480p/20 fps.
- Companion: macOS 13+, Windows 10+, Linux x64; Node bundled in the installer.

## 4. Configuration and tuning defaults

| Parameter | Default | Range | Where set |
|---|---|---|---|
| Camera resolution | 1280×720 | 640×480–1920×1080 | Settings |
| Inference fps | 30 (15 idle) | 15–60 | Auto |
| 1€ `min_cutoff` / `beta` | 1.0 Hz / 0.007 | 0.3–3 / 0–0.05 | Calibration slider ("steady ↔ responsive") |
| Pinch in / out threshold | 0.35 / 0.50 × palm width | 0.2–0.6 | Calibration |
| Tap max duration | 300 ms | 150–500 | Settings |
| Hold gesture time | 500 ms (Victory) / 600 ms (Thumbs) / 1000 ms (Palm clutch) | 300–1500 | Settings |
| Swipe velocity / distance | 1.5 units/s / 0.25 units | — | Settings, off in Accessibility profile |
| Snap radius | 48 CSS px | 0 (off)–96 | Settings |
| Pointer gain (active box → viewport) | 1.6 | 1.0–3.0 | Calibration |
| Confidence gate | score ≥ 0.7 for 3 frames | — | Fixed |
| Agent snapshot cap | 150 items | — | Fixed |
| Guarded-action confirm timeout | 15 s | — | Fixed |

## 5. Phase-0 spike checklist

1. `pnpm create wxt@latest` with React template; add `offscreen` and `sidepanel` entrypoints.
2. Standalone playground page: `getUserMedia` → `GestureRecognizer` (GPU delegate) → draw landmarks; log fps for WebGPU, WebGL, WASM on 3 machines.
3. Implement 1€ filter and pinch feature; overlay cursor on the playground; measure camera-to-cursor latency with a high-fps phone camera recording the screen (target ≤ 50 ms added).
4. Record 5 people × 7 gestures × 3 distances as landmark fixtures; compute precision/recall with default thresholds; decide hold times.
5. Prototype snapping on a dense test page (news site clone) and a Fitts-style target task; record acquisition time with and without snapping.
6. Verify `chrome.debugger` click on a React page and inside a cross-origin iframe; verify content-script fallback on `chrome://` and on pages where debugger attach fails.
7. Go/no-go on browser inference vs native companion inference.

## 6. What this stack deliberately avoids

- **A backend for the MVP.** Everything runs on the user's machine; a backend appears only for optional sync/telemetry or a hosted agent tier.
- **Playwright/Puppeteer in production.** They own a browser; we live inside the user's. CDP via `chrome.debugger` gives the same primitives.
- **Loading models or WASM from CDNs at runtime.** Ship them in the extension for CSP, offline, and store-review reasons.
- **Raw video anywhere except the offscreen document.** Not in the side panel preview (skeleton only by default), not in storage, not to the agent.
- **Autonomous agent execution of guarded actions.** Confirmation is a hardware-adjacent signal (camera or keyboard), never a model output.
- **Vendor-specific LLM SDKs and features.** Everything the agent needs (tool calling, streaming, structured output) is expressed in the OpenAI-compatible wire format. Vendor extras (Anthropic prompt caching headers, OpenAI Responses API, Gemini-only fields) are exposed only as optional per-preset hints, never as a dependency.
