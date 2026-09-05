# Gesture Browser Agent — Product Requirements Document

**Status:** Draft v0.1 · **Date:** 2026-09-04 · **Owner:** Long Dao

---

## 1. Summary

A Chrome extension that lets a person operate the web with hand gestures captured by an ordinary webcam, and that pairs those gestures with an LLM browser agent so the low bandwidth of gestures is compensated by the agent's understanding of the page.

Two layers work together:

| Layer | What it does | Runs where | Latency budget |
|---|---|---|---|
| **Direct control** | Hand pointer, pinch-to-click, grab-to-scroll, swipe back/forward, clutch (pause) | 100% on device, no network | < 50 ms added pointer latency, < 150 ms gesture→action |
| **Agent assist** | Understands the page, proposes or executes higher-level actions ("open the third result", "fill this form from my profile"), handles text entry via voice; gestures act as the trigger and the approve/reject signal | Extension + any OpenAI-compatible LLM provider (user-configured) | < 3 s to first proposal |

The thesis: **gestures are great for pointing, selecting, and confirming, and bad for everything else.** An agent fills the gap, and gestures in turn give the agent a fast, unambiguous human-in-the-loop signal.

---

## 2. Problem

1. **Hands-free web use is still poor.** Voice control (Voice Control, Voice Access) is slow for spatial tasks such as "click that thing", and pointing at arbitrary web content by speech means reading out numbers on overlays.
2. **Existing gesture tools are OS-level cursor emulators** (Project Gameface, Archand, dozens of MediaPipe + pyautogui demos). They know nothing about the page, so they demand pixel-precise pointing, which causes fatigue and errors.
3. **Browser agents (Claude in Chrome, Operator-style agents) are text/voice driven.** They lack a low-latency, low-effort way for the human to steer and approve, which is the main friction in human-in-the-loop agent use.

## 3. Target users

| Persona | Situation | What matters most |
|---|---|---|
| **Maya — motor impairment / RSI** | Limited fine motor control, cannot use a mouse for long periods; can lift a hand and make coarse gestures | Large effective targets (semantic snapping), low fatigue, reliable clutch, no false clicks, works with screen reader |
| **Duc — hands busy** | Cooking from a recipe, working in a workshop or lab with gloves/dirty hands, following a manual | Scroll, back, next-step, zoom without touching the laptop; tolerant of poor lighting and partial hand views |
| **Priya — presenter / large display** *(deferred to Phase 3)* | Standing 1–3 m from a screen during a demo or in a meeting room | Navigation and clicking from a distance, visible cursor, quick pause |
| **Developer / power user (secondary)** | Wants to try gesture+agent workflows, assign custom gestures, script actions | Custom gesture training, action mapping, open architecture |

Primary persona for MVP: **Maya.** Accessibility constraints produce the strictest requirements, and everything built for them serves the other personas.

**v1 operating range: ≤ 1.5 m from the camera.** The MediaPipe palm detector is trained for < 2 m and unreliable beyond ~1.5 m at 720p, so the presenter persona (Priya, 1–3 m) moves to Phase 3 with a pose-based design (body landmarks, large poses, dwell instead of pinch). See 04-feasibility §2 B2.

## 4. Goals and non-goals

### Goals
- G1. A user can browse a typical content site (read, scroll, follow links, go back, switch tabs) with one hand and no mouse/keyboard for 15 minutes without unacceptable fatigue.
- G2. Recognition is trustworthy: false activations (unintended clicks or navigations) are rare enough that users leave tracking on.
- G3. The agent turns a coarse gesture plus context into a precise action, and never acts on sensitive operations without an explicit confirming gesture.
- G4. Privacy by construction: camera frames never leave the device; only landmarks and gesture labels cross process boundaries.
- G5. Works on a mainstream laptop (2020+ MacBook Air / mid-range Windows laptop) at ≥ 30 fps with a built-in 720p webcam.

### Non-goals (v1)
- OS-level cursor control outside the browser (Gameface already exists; may be a later companion).
- Full sign-language recognition.
- Two-handed or full-body gestures.
- Mobile browsers.
- Fully autonomous long-running agent tasks without a human present.
- Browsers other than Chromium (Edge/Brave/Arc work by inheritance; Firefox is Phase 3).

## 5. User scenarios

**S1 — Reading a recipe (Duc).** Duc opens a recipe, then holds up an open palm for one second to arm tracking. A closed fist moved up/down scrolls the page. A left swipe goes back to the search results. An open palm again pauses tracking so he can wipe his hands without triggering anything.

**S2 — Navigating search results (Maya).** Maya raises her index finger; a cursor appears and snaps to the nearest link as she moves. A pinch clicks. On the destination page she makes a "victory" sign; a side panel opens and the agent lists three suggested actions it inferred from the page ("Open the pricing page", "Summarize this article", "Find the contact form"). She points at one and pinches, or gives a thumbs up to take the top suggestion.

**S3 — Filling a form (Maya + agent).** Maya points at a form. The agent recognizes a login/shipping form and proposes filling it from her saved profile (never passwords). She gives a thumbs up. The agent fills all fields but does not submit; the Submit button is highlighted and she pinches to submit herself.

**S4 — Text entry via voice (Phase 2).** Maya pinches a search box and holds; a microphone indicator appears; she speaks; releasing the pinch commits the text. Thumbs down clears it.

**S5 — Guarded action.** The agent, mid-task, reaches a "Place order" button. It stops, shows what it is about to do, and waits. Only a thumbs-up gesture held for 600 ms proceeds. Anything else, or a timeout, cancels.

**S6 — Presenting (Priya, deferred to Phase 3).** Priya stands 2 m from a TV. The extension detects the hand at small scale and increases pointer gain. Swipes move through slides in a web deck; pinch clicks embedded video controls. *This scenario is out of v1 scope (range > 1.5 m); it returns in Phase 3 with a pose-based design.*

## 6. Gesture vocabulary (v1)

Built on the seven MediaPipe canned gestures plus geometric gestures derived from the 21 hand landmarks. All are one-handed and can be performed with the elbow resting on a table or armrest.

| Gesture | Detection | Action | Notes |
|---|---|---|---|
| **Open palm, hold 1 s** | `Open_Palm` + stillness | Clutch: toggle tracking armed/paused | The only gesture active while paused. Visual + audio confirmation. |
| **Index point** | `Pointing_Up` or index extended | Pointer mode; index fingertip (landmark 8) drives cursor | Cursor snaps to nearest interactable element within a radius |
| **Pinch (tap)** | thumb tip (4) – index tip (8) distance below threshold, normalized to hand size, < 300 ms | Click snapped element | Hysteresis: pinch-in threshold tighter than pinch-out |
| **Dwell (hold still)** | pointer held within a small radius over a snapped target for the dwell time (default 600 ms), progress ring | Click snapped element | MVP click mode alongside pinch, for users who cannot pinch (04-feasibility B5); default in the Accessibility profile |
| **Pinch, hold** | pinch > 300 ms | Drag / long-press; in a text field → start voice input (Phase 2) | |
| **Double pinch** | two taps < 400 ms apart | Double-click | Optional, default off |
| **Closed fist + move** | `Closed_Fist` + wrist displacement | Scroll (grab-and-drag with inertia) | Vertical primary; horizontal when page overflows |
| **Open palm swipe left / right** | `Open_Palm` + lateral wrist velocity > threshold | Browser back / forward | Requires velocity and displacement; single fire per swipe |
| **Open palm swipe up / down** | `Open_Palm` + vertical velocity | Next / previous tab | Default off in accessibility profile (too easy to trigger) |
| **Victory ✌️** | Victory geometry (index+middle extended, others folded), independent of palm orientation, held 600 ms | Open agent panel / command palette with context suggestions | Detected by finger geometry, not the canned `Victory` label, so the palm-inward V (obscene in some regions) is still recognized |
| **Thumbs up 👍** | `Thumb_Up` held 700–800 ms | Confirm current agent proposal | Hold time is the safety mechanism; visible progress ring |
| **Thumbs down 👎** | `Thumb_Down` held 700–800 ms | Reject proposal / undo last agent action / dismiss | |
| **I love you 🤟** | `ILoveYou` | User-assignable (default: toggle zoom 150%) | |

Design rules applied:
- No gesture fires until the hand has been tracked stably for ≥ 300 ms, so the transient poses seen as a hand enters frame cannot trigger an action.
- Every state-changing gesture needs either a hold time or a velocity threshold, so a hand passing through a pose does not fire.
- Pointer and click are separate gestures on separate fingers so clicking does not move the cursor (the "Heisenberg effect" of pointing devices).
- Pause is always reachable with the same gesture and works from any state.
- Users may remap any gesture; the accessibility profile disables swipes by default.

## 7. Functional requirements

Priority: **M** must (MVP), **S** should (v1), **C** could (later).

### 7.1 Capture and recognition
- FR-1 (M) Acquire webcam video at 640×480–1280×720, 30 fps, from an extension offscreen document; user picks the camera.
- FR-2 (M) Run hand landmark detection on device with GPU (WebGL) acceleration when available, CPU (WASM-SIMD) fallback. Gesture classification is an in-browser classifier over normalized landmarks (FR-7), not the MediaPipe canned gesture head, which is kept only as an interim reference.
- FR-3 (M) Emit a structured gesture event stream: `{ts, handedness, landmarks[21], gesture, confidence, pointer:{x,y}}` at capture rate.
- FR-4 (M) Pointer smoothing with a speed-adaptive filter (1€ filter) tuned so a still hand produces a still cursor and a fast hand has no visible lag.
- FR-5 (M) Gesture state machine with debouncing, hold timers, hysteresis, and cooldowns; exactly-once semantics for discrete actions.
- FR-6 (S) Mirror mode, handedness preference (left/right), and per-user calibration (pinch threshold, pointer gain, active region mapping a comfortable hand box to the full viewport).
- FR-7 (M) The core gesture classifier is an in-browser MLP (kNN placeholder in Phase 0) over wrist-centred, scale-normalized landmarks, with a **mandatory "none" class** trained on natural hand motion to suppress false fires. Per-user custom gesture recording and training (10–20 samples per gesture) stored locally (S) uses the same path, retiring the Model Maker dependency. See 04-feasibility B4.
- FR-8 (S) Automatic gain adjustment based on apparent hand size (distance from camera).

### 7.2 Direct browser control
- FR-10 (M) Visible cursor overlay injected into every page (shadow DOM), with states: idle, pointing, hovering target, pinching, paused.
- FR-11 (M) Semantic snapping: pointer locks to the nearest interactable element (links, buttons, inputs, `role=button`, tabbable elements, video controls) within a configurable radius; the element gets a highlight ring. Raw-pixel mode available.
- FR-12 (M) Click, double-click, long-press, drag, scroll with inertia, back, forward, tab next/prev, reload, zoom.
- FR-13 (M) Hybrid click dispatch: content-script synthetic events are the **default** (pending Phase 0 G5 measurement of where they fail); trusted events via the DevTools Protocol (`chrome.debugger`) are used only in an opt-in "trusted click" mode or when the snapping index detects a target that needs user activation (fullscreen, `window.open`, native `<select>`, clipboard, drag-and-drop, sites checking `isTrusted`). `debugger` is an **optional permission**, requested on first need, attached per gesture session and detached on pause. See 04-feasibility A1/B1.
- FR-14 (M) Works across tab switches, new tabs, and SPA navigations without re-arming.
- FR-15 (S) Global on-screen HUD showing tracking status, current gesture, and a "camera active" badge; audio cues (optional).
- FR-16 (S) Keyboard shortcut and toolbar button to pause/resume as a non-gesture escape hatch.
- FR-17 (C) On-screen keyboard driven by pointer + pinch as a text entry fallback.

### 7.3 Agent assist
- FR-20 (S) "Victory" opens the agent panel showing 3–5 context-aware suggested actions derived from the current page (accessibility tree + optional screenshot).
- FR-21 (S) Natural-language goals via voice or typed text; the agent executes multi-step tasks in the current tab with visible step-by-step narration.
- FR-22 (S) Every agent action is previewed (target element highlighted, plain-language description) and cancellable with thumbs down.
- FR-23 (S) Sensitive actions (submit forms containing payment/credentials, purchases, sending messages/emails, deleting, changing account settings, downloading files) require an explicit confirming gesture; the agent may never self-confirm.
- FR-24 (S) Page content is treated as untrusted data: instructions found in pages are never followed; a prompt-injection heuristic flags suspicious content and pauses the agent.
- FR-25 (S) Site allow/deny lists; banking, healthcare, and government domains are agent-disabled by default (direct control still works).
- FR-26 (C) Voice text entry into any focused field via on-device speech recognition; agent cleans up dictation on request.
- FR-27 (C) Consume WebMCP tools when a site exposes them, in preference to DOM manipulation.
- FR-28 (C) Personal profile (name, addresses, preferences; never secrets) for form filling, stored locally and encrypted.

### 7.4 Settings, onboarding, and feedback
- FR-30 (M) First-run onboarding: camera permission, 60-second guided tutorial covering clutch, point, pinch, scroll; pinch calibration.
- FR-31 (M) Settings: camera selection, gesture mapping, sensitivity, snapping radius, profiles (Accessibility / Standard / Presenter), agent on/off.
- FR-32 (S) Local diagnostics: fps, inference time, dropped frames, false-positive log, with export.
- FR-33 (S) Opt-in anonymous telemetry (counts and timings only, never landmarks or images).

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| **Latency** | Camera-to-cursor ≤ 50 ms added over camera latency at 30 fps; gesture→action ≤ 150 ms for discrete gestures (after hold time); first agent suggestion **visible** ≤ 3 s p50, ≤ 6 s p95 (streamed, first suggestion rendered on arrival) |
| **Throughput** | ≥ 30 fps on Apple Silicon and 11th-gen Xe; ≥ 20 fps on the 2020 Intel Air. GPU cold init may take up to 30 s on some machines; warm up at install. Input resolution barely affects inference (models resize internally); capture at 640×480 by default |
| **Resource use** | ≤ 25% of one CPU core steady state with GPU delegate; ≤ 400 MB extension memory; no measurable jank on the page's main thread (all inference off the page's process) |
| **Accuracy** | ≥ 95% precision/recall on the canned gesture set under indoor lighting; pinch detection false positive < 1 per 10 minutes of pointing; swipe false positive < 1 per 30 minutes |
| **Robustness** | Recovers within 500 ms after the hand leaves and re-enters frame; degrades gracefully in low light (raise thresholds, disable swipes) |
| **Privacy** | Video frames confined to the offscreen document; no frame ever written to storage or network; landmark data not persisted unless the user records custom gestures; agent receives screenshots only when agent features are enabled and only of the active tab; clear indicator whenever camera is on |
| **Security** | Debugger permission scoped to the active tab and detached when paused; agent tool surface is an allowlist; secrets never enter the agent context; the LLM API key (BYOK) is confined to the service worker, never a content script, with a plain disclosure that extension storage is not an OS keychain (an OS-keychain companion is a Phase 3 option) |
| **Accessibility** | Compatible with screen readers (cursor overlay is `aria-hidden`; HUD announcements via live region); high-contrast cursor; all features also reachable via keyboard |
| **Compatibility** | Chrome 128+ (offscreen USER_MEDIA, side panel); Chrome 139+ for on-device speech (`processLocally`, Phase 2); Edge/Brave via Chromium. No WebGPU dependency (delegate is WebGL → WASM) |
| **Offline** | Direct control fully functional offline; agent features degrade to "unavailable" |

## 9. Safety model for the agent

1. **Gesture as consent.** Thumbs-up-and-hold is the only path to executing a sensitive action. The agent cannot generate this signal; it comes only from the camera pipeline.
2. **Preview before act.** Every action shows a highlighted target and a one-line description for at least 400 ms before executing, cancellable by thumbs down or by pausing.
3. **Least privilege.** Tools exposed to the model: `observe_page`, `click(element_id)`, `type(element_id, text)`, `scroll`, `navigate(url)`, `select_tab`, `propose(actions[])`, `request_confirmation(action)`. No arbitrary JavaScript execution, no file system, no cross-tab reads without user selection.
4. **Untrusted content.** Page text and screenshots are wrapped as data; the system prompt instructs the model to ignore instructions inside them; a lightweight classifier flags injection patterns and forces a confirmation.
5. **Domain policy.** Default deny-list for financial/health/government; per-site overrides; agent shows the current policy in the panel.
6. **Kill switch.** Open palm, keyboard shortcut, toolbar button, or closing the side panel all halt the agent immediately and detach the debugger.

## 10. Success metrics

| Metric | Target (MVP) | How measured |
|---|---|---|
| Target acquisition time (Fitts-style task, 40 px targets) | ≤ 1.8 s median with snapping | Built-in test page |
| Click precision | ≥ 95% correct target with snapping | Test page |
| False activations | < 1 unintended discrete action per 10 min | Diagnostics log, user studies |
| Sustained session | ≥ 15 min without stopping due to fatigue, 8 of 10 testers | Study with accessibility participants |
| Inference fps | ≥ 30 fps on reference laptops | Diagnostics |
| Agent suggestion acceptance (Phase 2) | ≥ 40% of suggestions accepted | Local telemetry (opt-in) |
| Retention | 50% of installers still enabling tracking after 7 days | Opt-in telemetry |

## 11. Roadmap

| Phase | Duration | Scope | Exit criteria |
|---|---|---|---|
| **0 — Spike** | 2 weeks | Standalone web page: camera → MediaPipe → cursor overlay, pinch click, fist scroll; measure fps and latency on 3 laptops | ≥ 30 fps, pinch precision ≥ 90%, decision on GPU delegate |
| **1 — MVP extension** | 6–8 weeks | MV3 extension; offscreen camera; gesture state machine; cursor overlay + semantic snapping; click/scroll/back/forward/tabs; clutch; calibration; onboarding; settings; diagnostics | 5 accessibility testers complete S1 and S2 unaided |
| **2 — Agent assist** | 8 weeks | Provider-agnostic agent loop (OpenAI-compatible API, BYOK); page observation; suggestions panel via Victory; confirm/reject gestures; guarded actions; voice text entry; safety policies | S3, S4, S5 pass; no unconfirmed sensitive action in red-team tests |
| **3 — Expansion** | ongoing | Custom gestures; profiles sync; WebMCP; Firefox; presenter mode; optional OS-level companion | — |

## 12. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Gorilla-arm fatigue makes sessions short | Core value fails | Elbow-supported posture in onboarding; small active region with high gain; snapping so precision is not required; clutch encourages resting |
| False pinch/swipe activations erode trust | Users disable tracking | Hold times, hysteresis, velocity gating, per-user calibration, accessibility profile disables swipes |
| Sites block synthetic events or use canvas UIs | Clicks do nothing | CDP trusted events; raw-pixel pointer mode; agent fallback via vision |
| Camera access in MV3 is finicky | Extension unusable | Offscreen document with `USER_MEDIA`; fallback to a pinned "camera tab"; pre-flight checks in onboarding |
| Debugger banner ("extension is debugging this browser") annoys users | Uninstalls | Attach only during click dispatch or agent runs; offer content-script-only mode |
| Prompt injection drives the agent to harmful actions | Security incident | Gesture-gated confirmations, allowlisted tools, domain deny-list, injection classifier |
| MediaPipe delegate performance variance (no WebGPU in tasks-vision) | Performance variance | Benchmark WebGL vs WASM-SIMD in Phase 0; ship with auto-selection by timed first inference; handle `webglcontextlost` |
| Lighting/skin-tone/hand-size bias in the model | Excludes users | Evaluate across diverse testers in Phase 1; expose thresholds; custom-gesture training as a personal fallback |

## 13. Open questions

1. Should the agent's model calls go through a local companion (user-supplied API key or Claude subscription via Agent SDK) or a hosted backend with accounts? *Answered 2026-09-04:* BYOK against any OpenAI-compatible endpoint the user configures (own gateway, OpenRouter, local Ollama/vLLM); hosted later if there is a paid tier.
2. Do we require the debugger permission at install, or request it optionally when the user first hits a site where synthetic clicks fail? *Answered 2026-09-04:* optional permission, requested on first need; content-script dispatch is the default (see FR-13).
3. Voice: Web Speech API (cloud, Chrome-dependent) vs on-device Whisper-class model (privacy, +150 MB download). *Answered 2026-09-04:* on-device Web Speech first (Chrome 139+ `processLocally`), cloud fallback with consent, Whisper-in-browser only for custom vocabulary.
4. Is dwell-to-click wanted as an alternative for users who cannot pinch? *Answered 2026-09-04:* yes, dwell-click is a first-class MVP click mode (default in the Accessibility profile), not a "could".
5. Head/face gestures (Gameface-style) as an additional input channel for users without hand mobility?
