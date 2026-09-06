# 1A — Vertical slice — design spec

**Status:** DRAFT — brainstorm complete; four owner questions block finalization (see *Open questions*). Once answered, this becomes the validated design and drives `1A-vertical-slice.impl.md`.
**Milestone:** 1A (roadmap §4.1). **Base:** `master`. **Inputs (all logged in §8):** G1 frame-pump path = GO, G5 dispatch default = CDP, G8 provisional = GO (unblocks 1A only).

## 1. What 1A is

The golden path from `CLAUDE.md §4`: **one gesture end to end** — `fist scroll` — through the real component seam, so that every later milestone imitates the slice. Its product is not the feature but the **frozen shared interfaces**: `GestureFrame`, `Intent`, `PageCommand`, `PageEvent`, the FSM state tree, and the offscreen↔SW↔content-script port topology. 1B/1C/1D/2A *extend* these; none redefines them (roadmap §2.1).

Gesture chosen (roadmap-fixed): **palm clutch → Arm**, **fist → Scroll**. No classifier beyond the existing kNN placeholder; no snapping; no cursor.

## 2. Current state (what 0A/0B/0C already built)

- `packages/protocol`: `GestureFrame` **frozen v0**; `Intent` **provisional v0** = discriminated union `Arm | Pause | Scroll{dy}`; plus fixture/bench/pump/camera-grant. **No `PageCommand`, no `PageEvent`.**
- `packages/gesture-core`: `createGestureMachine()` — a *flat* `Paused`/`Armed` machine (palm-clutch→`Arm`, fist+velocity→`Scroll`), `FrameInput` interface, `replayFixture()` collecting emitted Intents. Timing constants in `constants.ts` (single owner).
- `apps/extension/entrypoints/background.ts`: camera pre-check gate + offscreen creation + pump-stat recording. **No FSM consumption, no dispatcher.**
- `apps/extension/entrypoints/offscreen/`: G1 frame pump (getUserMedia → `MediaStreamTrackProcessor` → worker → MediaPipe), emits numeric `PumpStat` only via `browser.runtime.sendMessage`. **Does not yet emit `GestureFrame`.** Offscreen uses only `browser.runtime` messaging (no `chrome.tabs`).
- `apps/extension/entrypoints/content/index.ts`: empty stub.

## 3. The five questions

### Q1 — Placement
Three components joined by `packages/protocol` messages — this milestone exists to fix that seam:
- **offscreen** (perception): derive `GestureFrame` from worker landmark output; publish it. Owner rule: `.claude/rules/offscreen.md`.
- **gesture-core** (pure FSM, consumed by the service worker): `GestureFrame`→FSM→`Intent`. Owner rule: `.claude/rules/gesture-core.md`.
- **service worker** (`background.ts`, control): consume `GestureFrame`, run the machine, map `Intent`→dispatch, persist session state. Owner rule: `.claude/rules/background.md`.
- **content script** (page plane): execute the dispatched `PageCommand` (scroll) on the page. Owner rule: `.claude/rules/content.md`.

Joining messages, all in `protocol` (Q3): `GestureFrame` (offscreen→SW), `Intent` (internal to gesture-core→SW), `PageCommand` (SW→CS), `PageEvent` (CS→SW).

### Q2 — Boundary check (per rule file)
- offscreen: `@mediapipe/tasks-vision`, `gesture-core`, `protocol`, runtime Port — **allowed**. Must publish only `GestureFrame` (no video/landmarks in steady state) — respected.
- gesture-core: pure TS, `xstate`, `zod`, `protocol` types — **allowed**. All timing/hysteresis/cooldown stays here (`constants.ts`) — respected.
- background: `gesture-core`, `protocol`, `chrome.*` — **allowed**. Validate every inbound Port msg with the Zod schema before acting — required. (See Q1 dispatch note re: the "CDP is primary input" rule vs. scroll.)
- content: `page-index`, `protocol`, DOM/Shadow DOM — **allowed**. No `chrome.*`, no gesture timing, validate every `PageCommand` — respected. 1A adds no `page-index` dependency (no snapping).

### Q3 — Interfaces touched (Zod in `protocol` first)
- **`GestureFrame`**: unchanged (already frozen v0); confirmed as the offscreen→SW payload. 1B extends with classifier fields.
- **`Intent`**: promote from *provisional* to *fixed*. Keep discriminated union on `type` with members `Arm | Pause | Scroll`. `Scroll.dy` contract = **signed CSS pixels** (positive = down); the vy→px conversion constant stays a tunable in `gesture-core/constants.ts`. Later milestones **add** members (Click, Drag, Swipe, Hold) — additive only.
- **`PageCommand`** (new; arch §6 sketch): 1A adds the variant that carries scroll to the page (exact shape depends on **Q1**). Arch §6's sketched variants (`pointer`, `highlight`, `preview`, `snapshot`, `fallbackClick`) are the documented target that 1C/2A add additively.
- **`PageEvent`** (new; arch §6 sketch): 1A adds `{ type: 'ready'; frameId }` so the SW knows a content script is alive before dispatch. `hover`/`snapshot` added by 1C/2A.
- **FSM state tree + transition-log shape**: frozen here (**Q3 owner question** for exact scope + log shape).

### Q4 — Principle check (arch §1)
- **Two loops, two speeds**: 1A is entirely the fast perception–control loop; no agent, no network. Respected.
- **Video stays in one process**: only `GestureFrame` leaves offscreen. Respected.
- **Page is hostile**: content script holds no secrets/authority, executes only SW-sent `PageCommand`, validates each with Zod. Respected.
- **Agent proposes / human disposes**: n/a in 1A (no agent), but the FSM-as-sole-confirmer seam is established.
- **Replaceable parts**: FSM, dispatcher, and executor sit behind the protocol messages. Respected.

### Q5 — Tests
- **Fixture replay (unit, gesture-core)**: a fixture drives normalize→classifier→FSM and asserts the expected `Intent` sequence (Exit E: "Fixture replay produces the expected Intent sequence"). Extends the existing `replayFixture` path.
- **Playwright e2e (fake camera)**: scrolls a test page (Exit E). Determinism approach depends on **Q4**.
- **Boundary lint** on offscreen, background, content (Exit E).
- **Protocol contract tests** (`packages/protocol/test/contracts/**`): one per `I` row in the Exit-checks table (written this session, failing until execute), asserting what each consumer milestone needs from the frozen shapes.

## 4. Settled design decisions (from the docs; not owner questions)
1. `Intent` stays a `type`-discriminated union; `Arm`/`Pause`/`Scroll{dy}` are frozen; extension is additive (roadmap "1B/1C/1D/2A extend, none redefines").
2. `Scroll.dy` = signed CSS pixels; conversion tunable lives only in `gesture-core/constants.ts`.
3. `GestureFrame` is the offscreen→SW payload, unchanged from v0.
4. `PageEvent` in 1A = `{ type: 'ready'; frameId }` only.
5. FSM is hierarchical with PascalCase arch §5 names; 1A implements the subset needed for scroll.

## 5. Open questions (blocking finalization — batched to owner)

**Q1. Scroll dispatch path (freezes `PageCommand` shape + dispatch topology).**
Roadmap §4.1 session 3 says "dispatcher scroll via the G5 default path" (G5 default = CDP). Arch §3.2 says scroll defaults to **content-script `scrollBy` with inertia**, with CDP `mouseWheel` only in trusted mode. The G5 = CDP decision is about *clicks* (1C), not scroll.
*Recommendation:* content-script `scrollBy` via `PageCommand { type: 'scroll'; dy }` — no `debugger` permission in the slice, matches arch §3.2; CDP stays the *click* default reserved for 1C. (This is the intended reading of "G5 default path" as *the dispatch architecture G5 settled*, not literally CDP-for-scroll.)

**Q2. The direct offscreen→content-script Port.**
Plan scope lists "Port topology offscreen → content script and offscreen → service worker". But offscreen documents cannot use `chrome.tabs` (confirmed: the current offscreen doc uses only `browser.runtime` messaging), so a *direct* offscreen→CS port needs the SW to broker a `MessageChannel`. And 1A's scroll slice has **no** pointer/cursor consumer (the cursor is 1C).
*Recommendation:* 1A live-wires **offscreen→SW** (`GestureFrame`) and **SW→CS** (`PageCommand`), and *fixes + documents* the direct offscreen→CS topology (reserved port name + brokering approach) but **defers live `PointerUpdate` wiring to 1C**, its consumer — avoiding dead code (`CLAUDE.md §5`). If SW-brokered `MessageChannel` proves infeasible in 1C, that becomes an ADR then.

**Q3. FSM state-tree freeze scope + transition-log shape.**
(a) *Scope*: freeze the naming convention (hierarchical, PascalCase arch §5 names) and implement only `Paused` + `Armed.{Idle,Scrolling}`, treating the full arch §5 tree (`Armed.Pointing/PinchDown/Dragging/SwipeArmed/Hold`, `Agent.*`) as the documented target later milestones add additively — **vs** declaring all arch §5 states now as empty placeholders.
*Recommendation:* former — no dead placeholder states.
(b) *Transition-log shape* (consumed by 1D.5 diagnostics + replay tests; arch §3.2 "every transition is logged"): propose an event-sourced entry `{ ts: number; from: string; to: string; event: string; intent?: Intent }`, defined in `protocol`. Confirm or adjust.

**Q4. 1A e2e determinism without G4 recordings.**
No fist-gesture y4m exists (G4 recordings are owner work and *not* a 1A input), and the kNN placeholder cannot reliably classify "fist" from a synthetic y4m.
*Recommendation:* the fake camera runs the real pump (proving the offscreen path), but the scroll-triggering gesture is injected deterministically via a **test-only** hook that publishes a scripted `GestureFrame` sequence at the offscreen→SW boundary (absent/inert in production builds); the e2e then proves the `Intent`→dispatch→`scrollBy` wiring end to end. Confirm the hook and its placement.
