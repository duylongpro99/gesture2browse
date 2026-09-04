# Gesture Browser Agent — Feasibility Assessment

**Status:** Draft v0.1 · **Date:** 2026-09-04 · **Inputs:** 01-prd.md, 02-architecture.md, 03-tech-stack.md · **Method:** desk research against current (2025–2026) platform docs, Chromium issues, MediaPipe releases, HCI literature, and Anthropic policy. Sources are linked inline.

---

## 1. Verdict

**Feasible, with four design changes that must land before Phase 0 and one persona that must be descoped.**

| Layer | Verdict | One-line reason |
|---|---|---|
| Camera + inference in an MV3 extension | Feasible, architecture needs a fix | The offscreen document is *hidden*: `requestAnimationFrame`/`requestVideoFrameCallback` never fire and main-thread timers drop to 1 Hz. The frame pump in 02-architecture §3.1 would stall. Use `MediaStreamTrackProcessor` → Worker. |
| MediaPipe gesture recognizer | Feasible at ≤ 1.5 m, frontal palm, reduced gesture set | Maintained (tasks-vision 1.0.1, Aug 2026). GPU delegate is WebGL-only, no WebGPU. No per-gesture accuracy published; detector unreliable beyond ~1.5 m at 720p. |
| Direct control (snapping, CDP clicks) | Feasible with a UX cost | `chrome.debugger` is the only way to get `isTrusted` input, and its infobar cannot be suppressed. Plan a hybrid: synthetic events by default, CDP opt-in. |
| Human factors (fatigue, false activations) | Conditionally feasible | 15-minute sessions only with elbow support and a ~25×25 cm hand space. Dwell-click must be first-class, not "could". |
| Agent layer | Feasible, but not as specified | Claude subscription login in third-party apps is prohibited by Anthropic policy. Agent SDK bundles a ~200 MB binary. Recommend direct API from the extension with a user-supplied key; drop the companion for MVP. |
| Presenter persona (1–3 m) | **Not feasible in v1** | 720p webcam gives ~40 px hands at 2–3 m; palm detector trained for < 2 m. Move to Phase 3 with a body-pose approach. |

---

## 2. Concerns ranked by impact

### Tier A — blocks Phase 0 as written; change the design now

**A1. No frame pump in the offscreen document.**
Offscreen documents report `document.hidden === true`. `requestAnimationFrame` never fires there; `requestVideoFrameCallback` shares the rendering pipeline and does not fire either. Main-thread timers in a hidden page are aligned to 1 Hz (a live `MediaStreamTrack` counts as "WebRTC in use", which prevents the 1/min intensive throttling but not the 1 Hz alignment). Worker timers are not throttled.
*Solution:* create `new MediaStreamTrackProcessor({track})` on the offscreen window (Chrome ships it window-only), transfer its `readable` to a dedicated Worker, and `for await` the `VideoFrame`s. Delivery is driven by the camera, not by visibility. Run the MediaPipe recognizer in that same Worker with an `OffscreenCanvas` (Google's own `mediapipe-samples-web` has `gesture-recognizer.worker.ts`). Transferable `MediaStreamTrack` itself is "no active development" in Chrome, so transfer the stream, not the track.
Sources: [timer throttling](https://developer.chrome.com/blog/timer-throttling-in-chrome-88) · [rAF in offscreen docs](https://medium.com/@_charcoal_roses_/requestanimationframe-and-canvas-in-chrome-offscreen-what-really-happens-510a16553400) · [MediaStreamTrackProcessor](https://developer.chrome.com/docs/capabilities/web-apis/mediastreamtrack-insertable-media-processing) · [worker sample](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/hand-landmarker.worker.ts)

**A2. Camera permission cannot be requested from the offscreen document.**
`getUserMedia` in offscreen, popup, and side-panel pages fails with `NotAllowedError` if permission is not already granted to the `chrome-extension://<id>` origin. Chrome's "Allow this time" one-time grant is revoked on tab close and will silently break the offscreen doc later.
*Solution:* onboarding opens a full-tab extension page (`grant-camera.html` via `chrome.tabs.create`), requests camera (and mic, for Phase 2) there, and tells the user to pick "Allow on every visit". Before every offscreen start, check `navigator.permissions.query({name:'camera'})` and route back to onboarding if it is not `granted`.
Sources: [chromium-extensions thread](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/V09VMCLzvWM) · [samples issue #821](https://github.com/GoogleChrome/chrome-extensions-samples/issues/821) · [one-time permissions](https://developer.chrome.com/blog/one-time-permissions)

**A3. "WebGPU delegate" does not exist in tasks-vision.**
`delegate` is `"CPU" | "GPU"`; GPU means WebGL2. Feature requests #5029 and #5826 are open and unanswered. The GPU path RET_CHECK-crashes (no fallback) when float render targets are missing, has no recovery after WebGL context loss (page reload required), and can take up to 30 s to compile shaders on some Macs. On Pixel 6 the *GestureRecognizer* is slower on GPU (20.9 ms) than CPU (16.8 ms) because the gesture MLP is tiny; only the landmarker benefits from GPU.
*Solution:* remove WebGPU from the docs and the delegate-selection plan. Selection becomes WebGL → WASM-SIMD CPU, decided by a timed first inference (init > 5 s or per-frame > 40 ms → CPU). Handle `webglcontextlost` by recreating the recognizer. Seriously consider `HandLandmarker` (GPU) + your own landmark classifier (CPU, ~1 ms) instead of `GestureRecognizer` — see B4.
Sources: [#5029](https://github.com/google-ai-edge/mediapipe/issues/5029) · [#5826](https://github.com/google-ai-edge/mediapipe/issues/5826) · [#6296 float targets](https://github.com/google-ai-edge/mediapipe/issues/6296) · [#4720 context loss](https://github.com/google-ai-edge/mediapipe/issues/4720) · [#5447 slow init](https://github.com/google-ai-edge/mediapipe/issues/5447) · [official benchmarks](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer)

**A4. Agent auth model in PRD open question 1 is prohibited.**
Anthropic: "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users." Server-side enforcement since early 2026. Embedding the Agent SDK requires the Commercial ToS, an unmodified ~200 MB Claude Code binary per platform, and forbids intermediating usage on users' behalf.
*Solution:* user-supplied API key (BYOK) for MVP, or a hosted backend under your own key later. Skip the Agent SDK: eight flat tools need a `while (stop_reason === "tool_use")` loop or the `@anthropic-ai/sdk` beta tool runner (`betaZodTool` + `client.beta.messages.toolRunner`). See §5.
Sources: [Legal & compliance](https://code.claude.com/docs/en/legal-and-compliance) · [The Register](https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546) · [SDK repo](https://github.com/anthropics/claude-agent-sdk-typescript)

### Tier B — real risks; mitigations exist, decide in Phase 0/1

**B1. Debugger infobar is unavoidable and manual review is guaranteed.**
"X started debugging this browser" shows in every window while any tab is attached; only `--silent-debugger-extension-api` or enterprise force-install suppresses it. Per-extension allowlist (crbug 40815062) is unshipped. Attach fails if DevTools is open; opening DevTools later fires `onDetach`. Blocked on `chrome://`, Web Store, other extensions' pages. `debugger` + `<all_urls>` means mandatory manual Web Store review. Chromium refused an `isTrusted` content-script permission in 2023; there is no alternative on desktop.
*Solution:* hybrid dispatch. Synthetic events from the content script for hover, scroll, and the common click case; CDP only when the user enables "trusted click" mode or the snapping index detects a target that needs user activation (fullscreen, `window.open`, native `<select>`, clipboard, drag-and-drop, sites checking `isTrusted`). Attach per gesture session and detach on pause. Make `debugger` an optional permission (answers PRD open question 2: request on first need). Phase 0 item 6 should *measure* the fraction of test sites where synthetic clicks fail; if it is small, content-script-only becomes the default.
Sources: [chrome.debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger) · [crbug 40815062](https://issues.chromium.org/issues/40815062) · [chromium-dev refusal](https://groups.google.com/a/chromium.org/g/chromium-dev/c/94t2J_Jylyw) · [review process](https://developer.chrome.com/docs/webstore/review-process)

**B2. Range: presenter persona is out of reach.**
Palm detector input is 192² after square padding; a hand under ~6–8 % of frame height (~45–60 px at 720p) is unreliable. The detector was trained for < 2 m; issue reports show failure at 1.5 m. Pinch from 2D landmarks at 40 px hands is not viable.
*Solution:* scope v1 to ≤ 1.5 m and show a "move closer" HUD cue. Move Priya to Phase 3 with a pose-based design (arm/body landmarks, large open-palm/fist poses, dwell instead of pinch), which is how Kinect worked at 1.5–2 m.
Sources: [MediaPipe Hands paper](https://arxiv.org/abs/2006.10214) · [#377 distance](https://github.com/google/mediapipe/issues/377) · [depthai notes on padding](https://github.com/geaxgx/depthai_hand_tracker)

**B3. Performance targets are plausible on Apple Silicon, borderline on the 2020 Intel Air.**
No rigorous browser benchmark exists for the target laptops. Estimates (single hand, VIDEO mode, worker):

| Device | WebGL per frame | WASM-SIMD per frame |
|---|---|---|
| M1/M2 Air | 8–14 ms tracking, ~20 ms on re-detect | 15–25 ms |
| 2020 Intel Air (Iris Plus) | 15–25 ms | 30–50 ms |
| 11th-gen Xe (Windows/ANGLE) | 12–22 ms | 25–40 ms |
| UHD 620/630 | 25–45 ms | 40–70 ms |
| Cold GPU init | 2–30 s | < 1 s |

Input resolution barely matters (models resize to 192²/224² internally); 480p saves only upload time. VIDEO mode skips the palm detector while tracking, so re-detect frames cost ~2×.
*Solution:* the Phase 0 bench harness is the go/no-go, not an aside. Capture at 640×480, `numHands: 1`, decouple cursor render (60 Hz rAF in the content script) from inference rate, allow adaptive frame skipping to 20 fps on weak machines. Relax NFR to "≥ 30 fps on Apple Silicon and 11th-gen Xe; ≥ 20 fps on 2020 Intel Air".

**B4. Gesture accuracy and the canned classifier.**
Model card: SS-F1 95.5 % across skin tones (94.3–97.8 %), 93.9 % across gender; explicitly not validated for in-the-wild webcams, low light, or motion blur. No per-gesture numbers. Gestures degrade when the palm faces away; handedness flips on un-mirrored webcams, which breaks Thumb_Up/Thumb_Down. Tasks output is *unsmoothed* since 0.10 (the smoothing calculator was dropped), and z is wrist-relative, learned from synthetic data. Model Maker (custom gestures) is "no longer actively maintained", last release April 2024.
*Solution:* the canned classifier is just a 63-float → 128-d → 8-way MLP on normalized landmarks. Replace it with your own in-extension classifier over wrist-centred, scale-normalised landmarks: same accuracy class, ~1 ms on CPU, trainable per user with 10–20 samples, and it lets you add the **"none" class trained on natural hand motion** that cut false positives 6× in HaGRIDv2. This also unifies FR-7 (custom gestures) with the core path and retires the Model Maker dependency. Gate every label on palm-facing (normal of landmarks 0-5-17 toward camera), N-frame majority vote, score ≥ 0.6. Treat Thumb_Down and ILoveYou as secondary.
Sources: [gesture model card](https://storage.googleapis.com/mediapipe-assets/gesture_recognizer/model_card_hand_gesture_classification_with_faireness_2022.pdf) · [#4724 handedness](https://github.com/google-ai-edge/mediapipe/issues/4724) · [#4670 smoothing removed](https://github.com/google-ai-edge/mediapipe/issues/4670) · [Model Maker status](https://developers.google.com/edge/mediapipe/solutions/customization/gesture_recognizer) · [HaGRIDv2](https://arxiv.org/pdf/2412.01508) · [kinivi MLP](https://github.com/kinivi/hand-gesture-recognition-mediapipe)

**B5. Fatigue and false activations: targets are conditional.**
Consumed Endurance (CHI 2014): shoulder torque above ~15 % of max collapses endurance; recommends bent arm, plane midway between shoulder and waist, ~25×25 cm workspace, and **dwell over pinch for single-hand selection**. Elbow-anchored input is significantly less fatiguing with no efficiency loss (CHI 2021). Unsupported mid-air use fails at 3–5 min. Hand-tracked pointing runs at about half mouse throughput (2.2 vs ~5 bps); the Heisenberg effect accounts for ~30 % of pointing errors and pinch scatter has no fixable bias. No vendor publishes pinch false-positive rates; one study misrecognised ~1.5 % of pinches. Dwell: 600 ms rated easiest, 500–1000 ms accepted; 200 ms fails. Users approve ~93 % of agent permission prompts, so per-action confirmation degrades into reflex.
*Solution:* onboarding enforces elbow-on-desk and a small active box (PRD already leans this way; make it the default calibration). **Promote dwell-click from "could" (open question 4) to a first-class MVP click mode** alongside pinch. Freeze the pointer for ~150 ms at pinch onset and click the target snapped at that moment (already in the FSM; keep it). Raise thumbs-up confirm to 700–800 ms with a visible progress ring; require ≥ 300 ms of stable tracking before any gesture can fire; pinch release threshold ~1.5× engage distance plus 80–120 ms debounce. Launch with ≤ 6 gestures and a persistent cheat sheet. Reserve gesture confirmation for risk-stratified checkpoints, not every step.
Sources: [Consumed Endurance](https://hci.cs.umanitoba.ca/assets/publication_files/Consumed_Endurance_-_CHI_2014.pdf) · [Elbow-anchored](https://dl.acm.org/doi/10.1145/3411764.3445546) · [mid-air throughput](https://dl.acm.org/doi/10.1145/3567718) · [Heisenberg effect](https://dl.acm.org/doi/10.1145/3313831.3376876) · [dwell times](https://www.researchgate.net/publication/349577512_Usability_of_various_dwell_times_for_eye-gaze-based_object_selection_with_eye_tracking) · [approval rates](https://arxiv.org/html/2604.14228v1) · [checkpoint preference](https://arxiv.org/pdf/2510.05307)

**B6. Agent latency target (≤ 3 s p50) is not achievable with Sonnet-class as specified.**
Measured Sonnet 4.6: TTFT ≈ 1.7 s, 44 tok/s; Haiku 4.5: TTFT ≈ 0.74 s, 85 tok/s. A 300-token suggestion payload lands in ~7–8 s on Sonnet, ~4 s on Haiku. Sonnet 5's tokenizer also produces ~30 % more tokens than 4.6.
*Solution:* Haiku 4.5 for suggestion ranking (it is adequate for choosing 3–5 actions from ≤ 150 items), Sonnet 5 for multi-step execution, `effort: "low"`, streaming with the first suggestion rendered as it arrives, structured output for the JSON, and a byte-stable cached prefix (system + tools ≥ 1024 tokens). Re-state the metric as "first suggestion visible ≤ 3 s p50" and measure. Cost: ≈ $0.004 (Haiku) to $0.01 (Sonnet 5) per suggestion call; ≈ $0.10–0.25 per 10-step Sonnet task.
Sources: [Artificial Analysis](https://artificialanalysis.ai/models/comparisons/claude-sonnet-4-6-vs-claude-4-5-haiku) · [pricing](https://platform.claude.com/docs/en/about-claude/pricing)

**B7. API key storage in the extension.**
`chrome.storage.local` is plaintext LevelDB readable by any user-level process; this exact finding was made against Anthropic's own Chrome extension. Without a companion there is no OS keychain.
*Solution:* accept for a developer-preview MVP with clear disclosure, keep the key in the service worker only (never content scripts), tight `externally_connectable`, and advise Console spend limits. A hosted proxy issuing short-lived per-user tokens is the only design where the long-lived key never touches the client; schedule it with the paid tier.
Source: [Origin research](https://www.originhq.com/research/claude-for-chrome-takeover)

**B8. Prompt injection residual risk.**
Shipped agents report ~1 % attack success with best model + classifier against competent attackers, several percent without, and 30 %+ before safeguards; adaptive attackers still route around classifiers ("a classifier is not a sandbox"). Every vendor converged on: metadata-only action critic, origin-scoped read/write sets, hard human confirmation for a fixed sensitive-verb class.
*Solution:* the PRD safety model is aligned with industry practice. Add: propose-only as default mode; a metadata-only critic call (Haiku) that sees the proposed action, not page text, before any write; strip hidden/zero-size/off-screen nodes and HTML comments at extraction; confirmation UI renders target/origin/value from *your* action object, never from model text. Design so the worst outcome after a successful injection is bounded, not prevented.
Sources: [Anthropic defenses](https://www.anthropic.com/research/prompt-injection-defenses) · [Google origin sets + critic](https://blog.google/security/architecting-security-for-agentic/) · [Brave on Comet](https://brave.com/blog/comet-prompt-injection/) · [CaMeL](https://css.csail.mit.edu/6.5660/2026/readings/camel.pdf) · [Embrace The Red bypass](https://embracethered.com/blog/posts/2026/breaking-claude-code-opus-5-and-automode/)

### Tier C — confirmed workable, note the caveats

| Item | Finding | Action |
|---|---|---|
| Offscreen lifetime (`USER_MEDIA`) | Unbounded; only `AUDIO_PLAYBACK` times out. One doc per profile; guard with `chrome.runtime.getContexts`. Only `chrome.runtime` API available. Survives SW termination. | None beyond the guard. [offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen) |
| SW keep-alive with 30 Hz port | Since Chrome 114 each `Port.postMessage` resets the 30 s timer; the 5-min cap applies only to a single unsettled request. Chrome DevRel warns ports are "not meant to keep a service worker alive indefinitely". | Stateless SW, `chrome.storage.session`, reconnect on `onDisconnect`. [lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) |
| Message hop cost | Payload is trivial; risk is the double hop and a cold SW (50–200 ms). Content scripts can `runtime.connect` and the offscreen doc receives `onConnect` directly. | **Stream pointer data offscreen → content script directly; send only discrete intents to the SW.** Update 02-architecture §2 diagram. |
| WebGL in offscreen doc / workers | Works (Chrome's own advice for WebGPU/WebGL in extensions is "use an offscreen document"). SwiftShader fallback is deprecated, so blocklisted GPUs fail context creation outright. | Feature-detect WebGL2 → WASM fallback. |
| Worker + OffscreenCanvas with tasks-vision | Officially sampled; landmark output is plain JSON so cloning is fine. | None. |
| Web Speech in side panel | Works if mic permission was granted from a full tab. Chrome 139+ ships on-device recognition (`processLocally: true`, `SpeechRecognition.available/install`), ~17 languages, macOS bug open. | Answers open question 3: on-device Web Speech first, cloud fallback with consent, Whisper-in-browser only for custom vocabulary. [Chrome 139](https://developer.chrome.com/blog/new-in-chrome-139) |
| WebMCP | Origin trial Chrome 149–156. Pages can register tools; the *consumer* API (`getTools/executeTool`) is on `navigator.modelContextTesting` behind a flag. No stable extension consumer path. | Keep in Phase 3; interim: MAIN-world content script wrapping `registerTool` to mirror registrations. [WebMCP](https://developer.chrome.com/docs/ai/webmcp) |
| Cross-origin iframes | Content script in `all_frames` plus coordinate translation per frame; CDP coordinates are top-frame viewport CSS px and reach iframes automatically. | Already planned; add iframe geometry to the tab registry. |
| Accessibility of the tracker | Ultraleap and four estimators incl. MediaPipe showed no accuracy gap for hands of people with MND, MD, tremor, SCI, arthritis, stroke, MS; index finger tracking weakest; prosthetics and partial palm occlusion unreliable; contractures/limb differences untested. | Recruit for these in Phase 1; keep head/face fallback (open question 5) on the roadmap. [PMC study](https://pmc.ncbi.nlm.nih.gov/articles/PMC12103098/) |
| Cultural gestures | Thumbs-up is obscene in parts of the Middle East; palm-inward V is obscene in UK/IE/AU/NZ/ZA. | Detect V by finger geometry regardless of palm direction; confirm gesture remappable. |
| Pinch metric | Normalise by wrist→middle-MCP (0↔9), more rotation-stable than palm width; community thresholds ~0.25 in / 0.35 out with 3-frame dwell. Use `worldLandmarks` as a secondary vote when the hand turns. | Adjust 03-tech-stack §4 defaults; calibrate per user regardless. |
| 1€ filter | Start `min_cutoff` ≈ 1 Hz, `beta` 0; lower cutoff until static jitter gone, raise beta ×10 until lag acceptable. MediaPipe's own landmark settings (0.05 / 80) are a reference. Because Tasks output is unsmoothed, filter landmarks (at least 4, 8, 0, 9) as well as the pointer. | Add landmark filtering to §3.1. |
| Alternatives to MediaPipe | TF.js hand-pose-detection stale (2023). ONNX Runtime Web + YOLO/RTMPose hands is the WebGPU escape hatch but needs your own detector/tracker. Apple Vision hand pose via native companion is mature but macOS-only. WiLoR/HaMeR are not real-time in browser. | MediaPipe stays; keep ONNX-Web as reserve. |

---

## 3. Prior art lessons

Leap Motion, Kinect desktop control, RealSense laptops, Soli, and BMW gesture control all failed for the same reason: they competed with a mouse for able-bodied users and lost on speed, reliability, and fatigue. Handsfree.js is abandoned; Void Mouse (Web Store, 2026) has 19 users and is "blocked on some sites". What survived is accessibility-first (Project Gameface → ChromeOS Face Control, with **18 gestures and per-gesture size thresholds** added on user demand) and coarse pinch confirmation (Vision Pro). The PRD's thesis (gestures for point/select/confirm, agent for the rest, Maya as primary persona) is the one framing the evidence supports. Do not let Duc or Priya pull the design back toward general cursor emulation.

---

## 4. Required edits to the existing docs

**01-prd.md**
- §3/§5: move Priya (presenter, 1–3 m) to Phase 3 with a pose-based design; state the v1 operating range as ≤ 1.5 m.
- §6: add dwell-click as an MVP click mode; hold times: confirm 700–800 ms, Victory 600 ms, palm clutch 1000 ms; require ≥ 300 ms stable tracking before any gesture fires; detect Victory by geometry independent of palm orientation.
- §7.1 FR-7: custom gestures become the *core* classifier path (in-browser MLP over normalised landmarks with a mandatory "none" class), not a Phase 3 Model Maker feature.
- §7.2 FR-13: hybrid dispatch; `debugger` optional permission; content-script click as default pending Phase 0 measurement.
- §8 NFR: throughput "≥ 30 fps on Apple Silicon / 11th-gen Xe, ≥ 20 fps on 2020 Intel Air"; latency "first suggestion visible ≤ 3 s p50"; add "GPU cold init may take up to 30 s, warm up at install".
- §8 Compatibility: drop "WebGPU"; Chrome 128+ still correct for offscreen `USER_MEDIA` and side panel; Chrome 139+ for on-device speech.
- §13 Open questions: Q1 answered (BYOK now, hosted later; subscription prohibited); Q2 answered (optional, on first need); Q3 answered (on-device Web Speech first); Q4 answered (yes, MVP).

**02-architecture.md**
- §2 diagram + §3.1: replace `<video> → requestVideoFrameCallback` with `MediaStreamTrackProcessor` → transferred `ReadableStream` → Worker (`OffscreenCanvas`, WebGL delegate). Add direct offscreen ↔ content-script port for the pointer stream; SW receives intents only.
- §3.1: delegate order WebGL → WASM (no WebGPU); timed first inference; `webglcontextlost` recovery; filter landmarks as well as pointer; add own classifier stage after landmarks.
- §3.2: debugger attach only in trusted-click mode; SW stateless with `storage.session`.
- §3.5: companion removed from MVP; agent loop runs in the service worker via an own OpenAI-compatible tool loop (`agent-core`) against a user-configured provider (BYOK, any `baseURL`); companion re-enters only for OS keychain / on-device models / OS-level pointer.
- §4.2: add critic step before executing any write action; propose-only default.
- §7 permissions: `debugger` and `nativeMessaging` optional; LLM endpoint host is not known at build time, so request it at runtime via `optional_host_permissions` (`https://*/*`, granted for the configured `baseURL` origin only) or route through the companion when installed.
- Add a calibration onboarding step that acquires camera/mic permission from a full tab.

**03-tech-stack.md**
- Hand tracking row: WebGL delegate; `HandLandmarker` + own classifier, `GestureRecognizer` as the interim.
- Custom gestures row: drop Model Maker; in-browser MLP/kNN.
- Agent runtime row: own OpenAI-compatible tool loop; Agent SDK rejected (200 MB binary, ToS constraints, no subscription auth). *Done: provider-agnostic since 2026-09-04.*
- Models row: two configurable tiers, `fast` (Haiku/Flash-class for suggestion ranking) and `planner` (Sonnet/GPT-class for multi-step); the doc's latency and token-count figures for specific Claude models become per-preset notes. *Done.*
- Extension ↔ companion row: Phase 3 / optional.
- Voice row: Chrome 139+ `processLocally`.
- §4 defaults: pinch 0.25 / 0.35 × dist(0,9); thumbs hold 700 ms; stable-tracking gate 300 ms; capture 640×480 default.
- §5 spike checklist: see §5 below.

---

## 5. Revised Phase 0 spike (go/no-go gates)

1. **Frame pump in a hidden offscreen doc**: `MediaStreamTrackProcessor` → Worker → MediaPipe at 30 fps for 10 minutes with the doc hidden. Gate: sustained ≥ 28 fps delivery, no rAF/timer dependence.
2. **Camera permission flow**: grant from a full tab, restart Chrome, confirm offscreen `getUserMedia` succeeds without prompt; verify "Allow this time" failure mode is detected.
3. **Bench harness** on M1 Air, 2020 Intel Air, 11th-gen Xe Windows: WebGL vs WASM, `GestureRecognizer` vs `HandLandmarker`+MLP, 480p vs 720p, cold init time. Gate: per B3 table.
4. **Landmark fixtures**: 5 people × gestures × 3 distances (0.5 / 1.0 / 1.5 m) × 2 palm orientations, plus 30 min of "no gesture" natural motion per person. Compute per-gesture precision/recall and false fires per 10 min with N-frame voting. Gate: ≥ 95 % on the reduced set, < 1 false fire / 10 min.
5. **Click dispatch survey**: 20 representative sites (SPA frameworks, canvas UI, iframes, native `<select>`, `window.open`). Record where synthetic clicks fail. Decision: content-script default vs CDP default.
6. **Fitts task** with snapping vs raw, pinch vs dwell (600 ms), elbow-supported vs unsupported, 5-minute blocks with Borg CR10 ratings. Gate: ≤ 1.8 s median at 40 px targets; Borg ≤ 3 at 5 min supported.
7. **Agent latency probe**: the intended provider's `fast` and `planner` models (reference: Haiku 4.5 and Sonnet 5 via an OpenAI-compatible endpoint) with a 150-item snapshot, streamed structured output. Also verifies tool calling and `json_schema` support on the endpoint. Gate: first suggestion ≤ 3 s p50.
8. Go/no-go on browser inference vs ONNX-Web fallback; document the 2020 Intel Air result explicitly.

---

## 6. Residual unknowns

- No public browser benchmark of tasks-vision on the exact target laptops; item 3 above is the only way to know.
- Pinch false-positive rates are unpublished by every vendor; the < 1 / 10 min target must be treated as a measured release gate, not an assumption.
- Hand-tracking accuracy for contractures and limb differences is untested in the literature; recruit for it in Phase 1.
- Chrome may add idle-closing for offscreen documents in the future ("reserves the right"); keep the pinned-tab fallback in the design.
- Firefox (Phase 3) has neither `offscreen` nor `chrome.debugger`; expect a different capture host and content-script-only dispatch there.
