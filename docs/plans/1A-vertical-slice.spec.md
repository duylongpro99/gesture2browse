# 1A — Vertical slice — design spec

**Status:** VALIDATED — brainstorm complete; four owner questions answered 2026-09-06 (all as recommended, see §4). Drives `1A-vertical-slice.impl.md` and `1A-vertical-slice.md`.
**Milestone:** 1A (roadmap §4.1). **Base:** `master`. **Inputs (all logged in §8):** G1 frame-pump path = GO, G5 dispatch default = CDP, G8 provisional = GO (unblocks 1A only).

## 1. What 1A is

The golden path from `CLAUDE.md §4`: **one gesture end to end** — `fist scroll` — through the real component seam, so every later milestone imitates the slice. Its product is not the feature but the **frozen shared interfaces**: `GestureFrame`, `Intent`, `PageCommand`, `PageEvent`, the FSM state tree + transition-log shape, and the offscreen↔SW↔content-script port topology. 1B/1C/1D/2A *extend* these additively; none redefines them (roadmap §2.1).

Gesture chosen (roadmap-fixed): **palm clutch → Arm**, **fist → Scroll**. No classifier beyond the existing kNN placeholder; no snapping; no cursor.

## 2. Current state (0A/0B/0C)

- `packages/protocol`: `GestureFrame` **frozen v0**; `Intent` **provisional v0** = discriminated union `Arm | Pause | Scroll{dy}`; plus fixture/bench/pump/camera-grant. **No `PageCommand`, no `PageEvent`, no transition-log, no port-name constants.**
- `packages/gesture-core`: `createGestureMachine()` — a *flat* `Paused`/`Armed` machine (palm-clutch→`Arm`, fist+velocity→`Scroll`); `FrameInput` interface; `replayFixture()` (raw landmarks → normalize → **unseeded** `KnnClassifier` → FSM). Timing constants in `constants.ts` (single owner). Placeholder kNN returns `none` untrained, so a raw-landmark fixture emits no intents yet; `FixtureRecord` carries **one** `meta.gestureLabel` per record (no per-frame labels).
- `apps/extension/entrypoints/background.ts`: camera pre-check gate + offscreen creation + pump-stat recording. **No FSM consumption, no dispatcher.**
- `apps/extension/entrypoints/offscreen/`: G1 frame pump; emits numeric `PumpStat` only, via `browser.runtime.sendMessage`. **Does not yet emit `GestureFrame`.** Uses only `browser.runtime` messaging (no `chrome.tabs`).
- `apps/extension/entrypoints/content/index.ts`: empty stub.

## 3. The five questions

### Q1 — Placement
Three components joined by `packages/protocol` messages — this milestone exists to fix that seam:
- **offscreen** (perception): the inference worker derives `GestureFrame` from landmarks; offscreen main relays it over the SW port. Rule: `.claude/rules/offscreen.md`.
- **gesture-core** (pure FSM, consumed by the SW): `FrameInput`→FSM→`Intent` + transition log. Rule: `.claude/rules/gesture-core.md`.
- **service worker** (`background.ts` + `background/`): consume `GestureFrame`, run the machine, map `Intent`→dispatch, persist FSM/log to `chrome.storage.session`. Rule: `.claude/rules/background.md`.
- **content script**: execute the dispatched `PageCommand` (`scroll`) on the page; announce `ready`. Rule: `.claude/rules/content.md`.

Joining messages, all in `protocol`: `GestureFrame` (offscreen→SW), `PageCommand` (SW→CS), `PageEvent` (CS→SW), `TransitionLogEntry` (FSM diagnostics). `Intent` is internal (gesture-core→SW dispatcher).

### Q2 — Boundary check (per rule file)
- offscreen: `@mediapipe/tasks-vision`, `gesture-core`, `protocol`, runtime Port — allowed. Publishes only `GestureFrame` (no video/landmarks in steady state) — respected.
- gesture-core: pure TS, `xstate`, `zod`, `protocol` types — allowed. All timing/hysteresis/cooldown stays here (`constants.ts`) — respected.
- background: `gesture-core`, `protocol`, `chrome.*` — allowed. Validates every inbound Port message with the Zod schema before acting — required. Scroll dispatch is content-script `scrollBy` (not CDP) — see §4 Q1; the "CDP is primary input" rule concerns trusted *input events* (clicks/keys, 1C), not a programmatic `scrollBy`.
- content: `protocol`, DOM/Shadow DOM — allowed. No `chrome.*`, no gesture timing, validates every `PageCommand` — respected. 1A adds **no** `page-index` dependency (no snapping/index).

### Q3 — Interfaces touched (Zod in `protocol` first, then both sides)
- **`GestureFrame`**: unchanged (frozen v0); confirmed as the offscreen→SW payload. 1B extends with classifier fields.
- **`Intent`**: promote provisional→**fixed**, schema unchanged: discriminated union on `type`, members `Arm | Pause | Scroll`. `Scroll.dy` contract = **signed CSS pixels** (positive = content moves up / scroll down); the vy→px conversion constant is a tunable in `gesture-core/constants.ts`. Later milestones **add** members (Click/Drag/Swipe/Hold) — additive only.
- **`PageCommand`** (NEW): `discriminatedUnion('type', [...])` with the `{ type:'scroll'; dy:number }` variant (the only 1A command). Arch §6's `pointer`/`highlight`/`preview`/`snapshot`/`fallbackClick` are the documented target 1C/2A add.
- **`PageEvent`** (NEW): `discriminatedUnion('type', [...])` with `{ type:'ready'; frameId:number }`. Arch §6's `hover`/`snapshot` added by 1C/2A.
- **`TransitionLogEntry`** (NEW, part of the FSM-state-tree interface): `{ ts; from; to; event; intent? }` — event-sourced log the FSM produces for diagnostics (1D.5) and replay tests (arch §3.2).
- **Port names** (NEW, `protocol` constants): reserved names for the fixed topology (see §4 Q2).

### Q4 — Principle check (arch §1)
- **Two loops, two speeds**: 1A is entirely the fast perception–control loop; no agent, no network. ✓
- **Video stays in one process**: only `GestureFrame` leaves offscreen. ✓
- **Page is hostile**: content script holds no secrets/authority, executes only SW-sent `PageCommand`, validates each with Zod. ✓
- **Agent proposes / human disposes**: n/a (no agent in 1A); the FSM-as-sole-source-of-intents seam is established. ✓
- **Replaceable parts**: FSM, dispatcher, executor sit behind protocol messages. ✓

### Q5 — Tests
- **FSM replay (unit, gesture-core)** — E1: drive a scripted `FrameInput` sequence (palm-hold ≥ `PALM_CLUTCH_MS` → `Arm`; fist + vertical velocity → `Scroll`) through `createGestureMachine()` and assert the `Intent` sequence and the `TransitionLogEntry` sequence. Scripted frames (not raw-landmark fixtures) because 1A keeps the untrained kNN placeholder and a single fixture cannot encode a two-gesture sequence; real-landmark classifier replay lands in 1B with a trained model.
- **Playwright e2e (fake camera)** — E2: the fake camera runs the real pump; a **test-only** hook (inert in production) publishes a scripted `GestureFrame` sequence at the offscreen→SW boundary; assert the test page scrolled (`Intent`→dispatch→`scrollBy` proven end to end).
- **Boundary lint** — E3: `node scripts/lint/boundary-lint.mjs` passes on offscreen, background, content.
- **Protocol/FSM contract tests** (`packages/*/test/contracts/**`): one per `I` row, written this session, frozen; assert what each consumer milestone needs through the owning package's public export.

## 4. Resolved decisions (owner-confirmed 2026-09-06)

- **Q1 — scroll dispatch = content-script `scrollBy`** via `PageCommand{ type:'scroll', dy }` (arch §3.2; no `debugger` permission in the slice). CDP stays the *click* default, reserved for 1C.
- **Q2 — direct offscreen→content-script Port deferred to 1C.** 1A live-wires **offscreen→SW** (`GestureFrame`) and **SW→CS** (`PageCommand`/`PageEvent`), and *reserves + documents* the direct `OffscreenToContent` port name and the SW-brokered-`MessageChannel` approach (offscreen has no `chrome.tabs`); live `PointerUpdate` wiring lands in 1C, its consumer. No dead code in 1A. If brokering proves infeasible in 1C, that is an ADR then.
- **Q3 — FSM freeze:** implement `Paused` + `Armed.{Idle,Scrolling}`; freeze the arch §5 PascalCase hierarchical naming as the documented target later milestones add to additively (no empty placeholder states now). **Transition-log shape `{ ts, from, to, event, intent? }` CONFIRMED.**
- **Q4 — e2e determinism:** test-only hook publishing a scripted `GestureFrame` at the offscreen→SW boundary, inert in production builds; e2e proves `Intent`→dispatch→`scrollBy`.

Additional decisions settled from the docs (not owner questions): `Intent` stays a `type`-discriminated union with `Arm/Pause/Scroll{dy}` frozen (additive after); `Scroll.dy` = signed CSS px, conversion tunable only in `gesture-core/constants.ts`; `GestureFrame` unchanged; `PageEvent` in 1A = `ready` only; FSM hierarchical with arch §5 names.

## 5. Interfaces already at final schema (freeze guards, green at plan time)

`GestureFrame` (frozen in 0A) and `Intent` (provisional schema equals its final schema — 1A only lifts the "provisional" marker) need **no** schema change from execute. Their `I`-row contract tests therefore pass at plan time and serve as **freeze guards**: they lock the shape so execute's edits (removing the provisional comment; adding downstream fields later) cannot silently alter it. The genuinely-new interfaces — `PageCommand`, `PageEvent`, `TransitionLogEntry` + hierarchical FSM — have contract tests that **fail today** and are made to pass by execute without being edited.
