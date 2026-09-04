# Gesture Browser Agent — Architecture

**Status:** Draft v0.1 · **Date:** 2026-09-04

---

## 1. Architectural principles

1. **Two loops, two speeds.** A deterministic, on-device *perception–control loop* runs at camera rate (30 fps) and must never wait on the network or on a model. A slower *agent loop* runs on demand and communicates with the fast loop only through well-defined events (proposals, confirmations).
2. **Video stays in one process.** Camera frames exist only inside the extension's offscreen document. Everything downstream sees landmarks and gesture labels.
3. **The page is a hostile environment.** Content scripts hold no secrets and no authority; the service worker owns policy, and the DevTools Protocol delivers trusted input.
4. **The agent proposes, the human disposes.** Only a gesture (or keyboard) event originating in the perception pipeline can confirm a guarded action.
5. **Replaceable parts.** Recognizer, filter, state machine, action executor, and agent backend sit behind small interfaces so each can be swapped or tested in isolation.

## 2. System overview

```mermaid
flowchart LR
  subgraph Chrome["Chrome (Manifest V3 extension)"]
    direction TB
    OFF["Offscreen document<br/>(reason: USER_MEDIA)<br/>Camera · MediaPipe · 1€ filter"]
    SW["Service worker<br/>Gesture state machine · Policy · Action dispatcher · Tab registry"]
    CS["Content script (per tab)<br/>Cursor overlay · Interactable index · Snapping · Preview highlights · A11y tree extraction"]
    SP["Side panel (React)<br/>Status HUD · Suggestions · Agent log · Settings · Calibration"]
    DBG["chrome.debugger → CDP<br/>Input.dispatchMouseEvent / KeyEvent · Page.captureScreenshot"]
    OFF -- "GestureFrame @30fps<br/>(runtime.Port)" --> SW
    SW -- "PointerUpdate / Highlight / Preview" --> CS
    CS -- "InteractableIndex / HitTest / A11ySnapshot" --> SW
    SW -- "trusted input" --> DBG
    SW <-- "state, suggestions, commands" --> SP
  end
  subgraph Companion["Local companion (Node, optional, Phase 2)"]
    direction TB
    NM["Native messaging host"]
    AG["Agent runtime<br/>agent-core · OpenAI-compatible tool loop · tool allowlist · injection guard"]
    NM --> AG
  end
  SW <-- "Native Messaging (stdio JSON)" --> NM
  AG -- "OpenAI-compatible API (user-configured baseURL)" --> LLM[("LLM provider<br/>custom gateway · OpenRouter · local vLLM/Ollama · vendor compat endpoints")]
  CAM(("Webcam")) --> OFF
  MIC(("Mic (Phase 2)")) --> SP
```

### Why this shape

| Decision | Chosen | Rejected | Reason |
|---|---|---|---|
| Delivery form | Chrome extension | Desktop app emulating an OS mouse (Gameface style); Electron shell browser | Extension has the DOM, so it can snap to targets and describe the page to the agent; users keep their own browser, logins, and extensions. Desktop-level control is a later companion, not the core. |
| Camera host | Offscreen document with `USER_MEDIA` reason | Side panel (unreliable `getUserMedia`), popup (dies on blur), content script (per-tab permission prompts, leaks video into page context), dedicated pinned tab (works, but ugly) | One long-lived hidden document owns the camera for the whole browser session; pinned tab kept as fallback. |
| Inference location | In the offscreen document (WASM + WebGPU/WebGL) | Native companion with Python MediaPipe | Zero install for the MVP; keeps video inside Chrome's sandbox; GPU delegate performance is sufficient on target hardware. Native inference stays an option behind the same `GestureFrame` interface. |
| Input dispatch | CDP via `chrome.debugger` with content-script fallback | Content-script `dispatchEvent` only | Synthetic events are `isTrusted=false` and ignored by many frameworks, iframes, and canvas apps; CDP events are indistinguishable from real input. Fallback covers pages where the debugger cannot attach. |
| Agent placement | Local companion process via native messaging | Direct API calls from the extension; hosted backend | API keys and sensitive tool execution stay out of the extension and off the web; Agent SDK gives the loop, MCP, and permission hooks for free. Hosted backend can be added later behind the same message protocol. |
| Agent perception | Accessibility tree + interactable index first, screenshot on demand | Screenshot-only (computer-use style) | Tree is cheap, deterministic, and maps 1:1 to the snapping targets the user already sees; screenshots are added for canvas/visual layouts. |

## 3. Components

### 3.1 Offscreen document — perception pipeline

Responsibilities: camera capture, hand landmark + gesture inference, pointer derivation, smoothing, framing into `GestureFrame`.

```
getUserMedia(720p, 30fps)
  → <video> → requestVideoFrameCallback
  → GestureRecognizer.recognizeForVideo(frame, ts)     // MediaPipe tasks-vision, VIDEO mode, 1 hand (2 optional)
  → Landmark normalizer (translate to wrist, scale by palm size, mirror if selfie)
  → Derived features: pinch distance (4↔8) / palm size, finger extension flags, wrist velocity, hand bbox scale
  → Pointer = landmark 8 (index tip) mapped from calibrated active box → viewport [0,1]²
  → 1€ filter on pointer (min_cutoff≈1.0 Hz, beta≈0.007, d_cutoff≈1.0) — tuned in calibration
  → GestureFrame { ts, present, handedness, gesture, score, pinch, features, pointer, raw landmarks? }
  → runtime.Port.postMessage (structured clone; landmarks omitted unless recording)
```

Notes:
- Run inference in a Web Worker inside the offscreen document when WebGPU-in-workers is available, so the offscreen document's own thread stays responsive for port messaging; fall back to main thread of the offscreen document otherwise.
- Delegate selection at startup: WebGPU → WebGL → WASM-CPU, based on a 2-second self-benchmark; result cached.
- Adaptive frame rate: drop to 15 fps when no hand has been seen for 5 s (saves CPU); resume at 30 fps on detection.
- Model bundle: `gesture_recognizer.task` (canned 7 gestures). A custom `.task` from Model Maker can be swapped in via settings (Phase 3).

### 3.2 Service worker — control plane

Responsibilities: gesture state machine, policy, mapping gestures to actions, tab registry, debugger lifecycle, agent messaging, settings.

- **Gesture state machine** (XState): consumes `GestureFrame`s, emits `Intent`s. States: `Paused`, `Armed.Idle`, `Armed.Pointing`, `Armed.PinchDown`, `Armed.Dragging`, `Armed.Scrolling`, `Armed.SwipeArmed`, `Armed.HoldGesture(kind)`, `Agent.Proposing`, `Agent.AwaitingConfirm`. Hold timers, cooldowns, and hysteresis live here, not in the recognizer. Event-sourced: every transition is logged for diagnostics and replay tests.
- **Action mapper**: `Intent × Profile → Action`. Profiles: Accessibility, Standard, Presenter; user overrides stored in `chrome.storage.sync`.
- **Action dispatcher**: executes `Action`s: `pointer.move` → content script; `click`/`drag`/`key` → CDP `Input.*` on the active tab (attaches lazily, detaches after 10 s idle or on pause); `scroll` → CDP `Input.dispatchMouseEvent(type=mouseWheel)` or content-script `scrollBy` with inertia; `history.back/forward`, `tabs.*`, `zoom` → chrome APIs.
- **Tab registry**: tracks active tab, iframe frames, and whether the content script is alive; re-injects on SPA route change if needed.
- **Policy engine**: site allow/deny for agent; guarded-action classification; kill switch fan-out.
- **Keep-alive**: MV3 service workers idle out after 30 s; the open runtime Port from the offscreen document keeps it alive while tracking is armed, and `chrome.alarms` handles reconnection.

### 3.3 Content script — page plane

Injected into every frame (`all_frames: true`, `document_start`), isolated world, Shadow DOM overlay.

- **Cursor overlay**: a `<div>` in a closed shadow root at `z-index: 2147483647`, `pointer-events: none`, `aria-hidden`. States rendered as shape/colour: idle, pointing, hover-snapped, pinch, drag, paused. Position updates via `transform: translate3d` on `requestAnimationFrame`, interpolating between 30 fps updates for 60/120 Hz displays.
- **Interactable index**: maintains a spatial index (grid buckets) of actionable elements: `a[href]`, `button`, `input`, `select`, `textarea`, `[role=button|link|tab|menuitem|checkbox|option]`, `[tabindex>=0]`, `[onclick]`, `video` controls, plus heuristics for large clickable cards. Rebuilt on `MutationObserver` (debounced), scroll, and resize; visibility-filtered with `elementFromPoint` checks on the candidates.
- **Snapping**: given pointer `(x,y)` and radius `r` (default 48 CSS px, scaled by pointer speed: no snap while moving fast), pick the nearest visible interactable by distance to its bounding box; hysteresis prevents flicker between neighbours; returns element id and centre for the click dispatch.
- **Preview highlights**: draws a ring around the element the agent intends to act on, with the action label.
- **A11y snapshot**: builds a compact accessibility-tree-like JSON of visible interactables (`id, role, name, value, bbox, state`) for the agent; ids are stable per page load and shared with the snapping index so "click element 17" is unambiguous.
- **Fallback input**: synthetic `pointerdown/mousedown/mouseup/click` sequence and `focus()` when CDP is unavailable.

### 3.4 Side panel — human interface

React app in `chrome.sidePanel`. Shows tracking status, camera preview toggle (landmark skeleton only, not raw video, by default), calibration wizard, gesture map editor, profiles, agent suggestions, agent step log with cancel, safety policy display, diagnostics. Also hosts the microphone for voice input in Phase 2 (side panel is a visible, user-opened surface, which is the right place for mic permission).

### 3.5 Local companion — agent plane (Phase 2)

Node 24 process registered as a native messaging host. Started by the extension on first agent use.

- **Protocol**: newline-delimited JSON over stdio (native messaging framing), messages: `observe`, `propose`, `run_task`, `confirm`, `cancel`, `status`. All actions flow back as `ProposedAction` and are executed by the *service worker*, never by the companion directly. The companion has no CDP access.
- **Agent runtime**: own `agent-core` tool loop over the OpenAI-compatible Chat Completions API with a custom tool set mirroring the extension's action surface (`observe_page`, `click`, `type`, `scroll`, `navigate`, `select_tab`, `propose`, `request_confirmation`). Each tool call returns to the extension for execution and reports back the observed result, giving the model a closed loop. No vendor SDK; any endpoint that speaks `/v1/chat/completions` with tools works.
- **Provider config**: `{ baseURL, apiKey, models: { fast, planner }, preset? }`, set by the user in the side panel. A setup-time capability probe records whether the endpoint supports tool calling, streaming, and `response_format: json_schema`; missing features switch on fallbacks (JSON-in-text parsing, non-streamed responses).
- **Model routing**: `fast` for suggestions and single steps (latency), `planner` for multi-step task planning; both are just model ids on the configured endpoint.
- **Injection guard**: page text is wrapped in a delimiter block labelled as untrusted; a regex/small-classifier pass looks for imperative instructions to the assistant in page content; positives force a `request_confirmation`.
- **Guarded action classifier**: rule-based (URL patterns, button text, form field types `password`, `cc-number`, `email` submit) plus model self-report; marks actions that require thumbs-up.
- **Secrets**: API key or OAuth token lives in the companion's OS keychain entry, never in `chrome.storage`.

## 4. Data flow

### 4.1 Direct control: pinch to click

```mermaid
sequenceDiagram
  participant Cam as Webcam
  participant Off as Offscreen (MediaPipe)
  participant SW as Service worker (FSM)
  participant CS as Content script
  participant CDP as chrome.debugger
  Cam->>Off: frame (33 ms cadence)
  Off->>Off: landmarks → features → 1€ filter
  Off->>SW: GestureFrame{pointer, pinch=0.9, gesture=None}
  SW->>CS: PointerUpdate{x,y}
  CS->>CS: snap to nearest interactable (id 17, "Sign in" button)
  CS-->>SW: HoverTarget{id:17, bbox}
  Off->>SW: GestureFrame{pinch=0.18}  (below pinch-in threshold)
  SW->>SW: Pointing → PinchDown (start 300 ms timer)
  Off->>SW: GestureFrame{pinch=0.45}  (above pinch-out threshold, < 300 ms)
  SW->>SW: PinchDown → Click intent
  SW->>CDP: Input.dispatchMouseEvent(pressed/released at bbox centre)
  CDP-->>SW: ok
  SW->>CS: Feedback{click at 17}
  CS->>CS: ripple animation on cursor
```

Budget: 33 ms (frame) + ~12 ms (inference, GPU) + ~2 ms (filter+port) + ~1 ms (snap) + ~5 ms (CDP round trip) ≈ 55 ms from frame capture to click, well inside the 150 ms target once the hold/hysteresis time is excluded.

### 4.2 Agent assist: Victory → suggestions → thumbs up

```mermaid
sequenceDiagram
  participant Off as Offscreen
  participant SW as Service worker
  participant CS as Content script
  participant SP as Side panel
  participant Co as Agent runtime (agent-core)
  Off->>SW: Victory held 500 ms
  SW->>CS: RequestA11ySnapshot
  CS-->>SW: A11ySnapshot (≈2–6 KB JSON)
  SW->>Co: observe{url, title, snapshot, screenshot?: no}
  Co->>Co: LLM (fast model): propose 3–5 actions with element ids
  Co-->>SW: propose[{id:"open-pricing", action:click(23), label:"Open Pricing", guarded:false}, ...]
  SW->>SP: show suggestions
  SW->>CS: highlight candidates
  Off->>SW: Thumb_Up held 600 ms
  SW->>SW: AwaitingConfirm → Execute top suggestion
  SW->>CS: Preview{23, "Open Pricing"} (400 ms)
  SW->>SW: dispatch click via CDP
  SW->>Co: result{ok, newUrl}
```

### 4.3 Guarded action

Same as 4.2, but the companion marks `guarded:true` (for example a "Place order" button). The service worker enters `Agent.AwaitingConfirm` with a 15 s timeout; only a `Thumb_Up` hold from the perception pipeline (or the keyboard confirm shortcut) transitions to execute. `Thumb_Down`, `Open_Palm` (pause), timeout, or panel Cancel abort and notify the companion.

## 5. Gesture state machine (core)

```mermaid
stateDiagram-v2
  [*] --> Paused
  Paused --> Armed : Open_Palm held 1 s
  Armed --> Paused : Open_Palm held 1 s / shortcut / panel
  state Armed {
    [*] --> Idle
    Idle --> Pointing : index extended
    Pointing --> Idle : hand lost 500 ms
    Pointing --> PinchDown : pinch < in_threshold
    PinchDown --> Pointing : pinch > out_threshold within 300 ms → emit Click
    PinchDown --> Dragging : held > 300 ms → emit DragStart
    Dragging --> Pointing : pinch > out_threshold → emit DragEnd
    Idle --> Scrolling : Closed_Fist
    Pointing --> Scrolling : Closed_Fist
    Scrolling --> Idle : fist released → emit ScrollEnd (inertia)
    Idle --> SwipeArmed : Open_Palm, low velocity
    SwipeArmed --> Idle : lateral velocity > v_min && dx > d_min → emit Swipe(dir), cooldown 800 ms
    Idle --> Hold : Victory | Thumb_Up | Thumb_Down | ILoveYou
    Hold --> Idle : pose lost before hold time
    Hold --> Idle : hold time met → emit HoldGesture(kind), cooldown 1 s
  }
```

Rules encoded in the machine, not the recognizer:
- Confidence gating: a gesture label must exceed `score ≥ 0.7` for 3 consecutive frames to count.
- Cooldown after any discrete action prevents double fire.
- Pinch hysteresis: in at `0.35 × palm width`, out at `0.5 × palm width` (defaults, calibrated per user).
- Pointer freeze during pinch: pointer position is latched at pinch-in so the click lands where the user aimed.

## 6. Interfaces (TypeScript sketches)

```ts
// Perception → Control
interface GestureFrame {
  ts: number;                      // performance.now() in offscreen doc
  present: boolean;
  handedness?: 'Left' | 'Right';
  gesture?: 'None'|'Closed_Fist'|'Open_Palm'|'Pointing_Up'|'Thumb_Down'|'Thumb_Up'|'Victory'|'ILoveYou'|string;
  score: number;
  pinch: number;                   // thumb–index distance / palm width
  fingers: [boolean, boolean, boolean, boolean, boolean]; // extended flags
  velocity: { vx: number; vy: number }; // wrist, normalized units / s
  scale: number;                   // hand bbox height, proxy for distance
  pointer: { x: number; y: number }; // filtered, [0,1] viewport space
  landmarks?: Float32Array;        // 21×3, only when recording
}

// Control → Page
type PageCommand =
  | { type: 'pointer'; x: number; y: number; state: CursorState }
  | { type: 'highlight'; ids: number[]; label?: string }
  | { type: 'preview'; id: number; label: string }
  | { type: 'snapshot' }
  | { type: 'fallbackClick'; id: number };

// Page → Control
type PageEvent =
  | { type: 'hover'; id: number | null; bbox?: DOMRectReadOnly }
  | { type: 'snapshot'; items: A11yItem[] }
  | { type: 'ready'; frameId: number };

interface A11yItem { id: number; role: string; name: string; value?: string; bbox: [number,number,number,number]; state?: string[] }

// Control ↔ Companion
type CompanionMsg =
  | { t: 'observe'; url: string; title: string; items: A11yItem[]; screenshotPng?: string }
  | { t: 'run_task'; goal: string }
  | { t: 'confirm'; proposalId: string } | { t: 'cancel' }
  | { t: 'result'; proposalId: string; ok: boolean; observation?: unknown };
type CompanionEvt =
  | { t: 'propose'; proposals: Proposal[] }
  | { t: 'step'; text: string }
  | { t: 'need_confirm'; proposal: Proposal; reason: string }
  | { t: 'done' | 'error'; text: string };
interface Proposal { id: string; label: string; action: Action; guarded: boolean }
```

## 7. Security and privacy boundaries

```mermaid
flowchart TB
  subgraph Trust0["Untrusted"]
    PAGE["Web page DOM & text"]
  end
  subgraph Trust1["Extension, page plane"]
    CS["Content script (no secrets, no authority)"]
  end
  subgraph Trust2["Extension, control plane"]
    SW["Service worker (policy, CDP)"]
    OFF["Offscreen (video, never exported)"]
    SP["Side panel"]
  end
  subgraph Trust3["Companion"]
    AG["Agent + API key (OS keychain)"]
  end
  PAGE -. "text as data only" .-> CS --> SW
  OFF -- "landmarks only" --> SW
  SW -- "snapshot, no cookies, no secrets" --> AG
  AG -- "proposals, never direct actions" --> SW
```

- Permissions requested: `offscreen`, `sidePanel`, `storage`, `tabs`, `scripting`, `debugger` (optional permission, requested on first need), `nativeMessaging` (optional, Phase 2), host permission `<all_urls>` for the content script (explained in onboarding).
- The debugger banner is mitigated by attaching only while armed and detaching on pause.
- No frame, landmark, or screenshot is persisted unless the user records custom gestures (landmarks only) or opts into diagnostics.
- Companion binds to stdio only; no local HTTP server, so no cross-origin exposure.

## 8. Performance plan

| Stage | Target | Technique |
|---|---|---|
| Inference | ≤ 15 ms/frame GPU, ≤ 40 ms CPU | GPU delegate; 1 hand max; 720p → 480p downscale on weak machines; adaptive fps when idle |
| Offscreen → SW | ≤ 1 ms | Port messaging, no landmarks in steady state |
| SW → CS pointer | ≤ 2 ms | Port per tab; coalesce to one message per frame |
| Cursor render | 60–120 Hz | rAF interpolation; `transform` only; `will-change` |
| Snapping | ≤ 1 ms | Spatial grid over precomputed bboxes; recompute on mutation debounced 100 ms |
| CDP click | ≤ 10 ms | Debugger pre-attached while armed |
| Agent suggestion | ≤ 3 s p50 | `fast` model tier (Haiku/Flash/small-open-weight class); snapshot capped at 150 items; no screenshot unless tree is sparse |

## 9. Testing strategy

- **Recognizer fixtures**: recorded landmark sequences (JSON) for each gesture across 10+ people, lighting, and distances; replayed through features + FSM in Vitest; assertions on emitted intents and no false fires. This is the regression suite for every threshold change.
- **FSM model tests**: XState model-based testing to enumerate paths and cooldown invariants.
- **Extension e2e**: Playwright launching Chromium with the unpacked extension; fake webcam via `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<y4m>` with recorded gesture videos; assert clicks land on a test page.
- **Snapping tests**: DOM fixtures with dense/overlapping targets; property tests on hysteresis.
- **Agent red team**: pages with embedded injection attempts; assert no guarded action executes without a `confirm` message originating from the FSM.
- **Performance CI**: fps and per-stage timing on a reference machine, tracked over time.

## 10. Repository layout (proposed)

```
human-gesture/
  apps/
    extension/            # WXT project (MV3)
      entrypoints/
        offscreen/        # camera + MediaPipe pipeline
        background.ts     # service worker: FSM, dispatcher, policy
        content/          # overlay, index, snapping
        sidepanel/        # React UI
      public/models/      # gesture_recognizer.task, wasm
    companion/            # Node native-messaging host (optional: OS keychain, local models)
    playground/           # Phase-0 web page for tuning and demos
  packages/
    gesture-core/         # features, 1€ filter, FSM, types (pure TS, no DOM)
    page-index/           # interactable index + snapping (DOM, testable in jsdom/happy-dom)
    protocol/             # shared message types + zod schemas
  fixtures/gestures/      # recorded landmark sequences and y4m videos
  docs/
```

## 11. Alternatives kept in reserve

- **Native inference companion** (Python/Rust with MediaPipe or a newer hand model) behind the same `GestureFrame` interface if browser inference proves too slow on low-end Windows laptops.
- **OS-level pointer mode** (companion drives the OS cursor via `enigo`/`pyautogui`) for users who want gestures outside Chrome.
- **Hosted agent backend** for a paid tier: same `CompanionMsg` protocol over WebSocket with account auth.
- **Head/face gestures** (MediaPipe Face Landmarker blendshapes, Gameface-style) as an alternative clutch/confirm channel for users without hand mobility.
- **WebMCP tool consumption** when sites expose structured tools; reduces token use and brittleness of DOM actions.
