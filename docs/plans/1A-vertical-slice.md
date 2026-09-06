# 1A — Vertical slice — Plan

The golden path (`CLAUDE.md §4`): one gesture end to end — **fist scroll** — through offscreen → service worker → content script, which **freezes** the shared interfaces every later milestone imitates. Roadmap row: `docs/05-roadmap.md §4.1`. Design: `1A-vertical-slice.spec.md`. Tasks + code: `1A-vertical-slice.impl.md`.

Plan inputs (all in roadmap §8): G1 frame-pump = GO, G5 dispatch default = CDP, G8 provisional = GO (unblocks 1A only).

## 1. Placement

Three components, joined by `packages/protocol` messages — the milestone exists to fix that seam. One owner each:
- **offscreen** (`entrypoints/offscreen/**`, rule `offscreen.md`): inference worker derives `GestureFrame`; offscreen-main relays it over the SW port.
- **gesture-core** (`packages/gesture-core/**`, rule `gesture-core.md`): FSM `FrameInput`→`Intent` + transition log; owns all timing.
- **service worker** (`entrypoints/background.ts` + `background/**`, rule `background.md`): consume `GestureFrame`, run the FSM, map `Intent`→dispatch, persist to `storage.session`.
- **content script** (`entrypoints/content/**`, rule `content.md`): execute `PageCommand{scroll}` via `scrollBy`; announce `ready`.

Joining messages (all in `protocol`): `GestureFrame` (offscreen→SW), `PageCommand` (SW→CS), `PageEvent` (CS→SW), `TransitionLogEntry` (FSM diagnostics). `Intent` is internal (gesture-core→SW dispatcher). No cursor/pointer and no direct offscreen→CS port in 1A (deferred to 1C).

## 2. Boundary check

Every needed import/API is allowed by the owner's rule file (details per task in the impl plan):
- protocol: `zod` only. ✓
- gesture-core: pure TS, `xstate`, `zod`, `@gesture/protocol` types. All timing/hysteresis/cooldown + the transition-log derivation here; vy→px scroll constant is a `constants.ts` tunable. ✓
- offscreen: `@mediapipe/tasks-vision`, `gesture-core`, `protocol`, runtime Port; video/`VideoFrame`/landmarks never leave (only `GestureFrame`, `landmarks` omitted in steady state); no gesture-timing constant here. ✓
- background: `gesture-core`, `protocol`, `chrome.*`; validates every inbound `GestureFrame`/`PageEvent` with Zod; no DOM/React/MediaPipe/secrets; transition log is diagnostic → `storage.session`. Scroll dispatch = content-script `scrollBy` (no CDP/`debugger` in 1A; the "CDP is primary input" rule concerns trusted input *events*, delivered 1C). ✓
- content: `protocol` + DOM + `browser.runtime` messaging; validates every `PageCommand`; no `storage`/`debugger`/`fetch`/secret/unsolicited action; no gesture timing. ✓

## 3. Interfaces touched

Zod in `protocol` first, then both sides (impl Task 1, then 3–5):
- `GestureFrame` — unchanged (frozen 0A); confirmed offscreen→SW payload.
- `Intent` — provisional→**fixed**, schema unchanged: `Arm | Pause | Scroll{dy}`, `dy` = signed CSS px. Additive after.
- `PageCommand` — **new**: `discriminatedUnion('type', [{scroll, dy}])`. Arch §6's other variants added by 1C/2A.
- `PageEvent` — **new**: `discriminatedUnion('type', [{ready, frameId}])`. `hover`/`snapshot` added by 1C/2A.
- `TransitionLogEntry` — **new**: `{ ts, from, to, event, intent? }` (part of the FSM-state-tree interface).
- FSM state tree — hierarchical `Paused` + `Armed.{Idle,Scrolling}`, arch §5 PascalCase names as the additive target.
- `PortName` — **new** constants; `OffscreenToContent` reserved (live in 1C).

1B/1C/1D/2A **extend** these; none redefines (roadmap §2.1).

## 4. Principle check (`02-architecture §1`)

- **Two loops, two speeds** — 1A is entirely the fast perception–control loop; no agent, no network.
- **Video stays in one process** — only `GestureFrame` (no landmarks) leaves offscreen.
- **The page is hostile** — content script holds no secrets/authority, runs only SW-sent `PageCommand`, validates each with Zod.
- **Agent proposes / human disposes** — n/a in 1A; the FSM-as-sole-source-of-intents seam is established for 2A.
- **Replaceable parts** — FSM, dispatcher, executor sit behind protocol messages.

## 5. Tests

- **E1** fixture/FSM replay (gesture-core): scripted palm→fist `FrameInput` → expected `Intent` sequence + `TransitionLogEntry` list.
- **E2** Playwright fake-camera e2e: pump runs; test-only hook injects a scripted `GestureFrame` at the offscreen→SW boundary (inert in prod); test page scrolls.
- **E3** boundary lint on offscreen, background, content.
- Five frozen contract tests (below), one per fixed interface.

A threshold/gesture change needs a fixture replay: 1A adds only `SCROLL_PX_PER_UNIT` (new tunable) and the FSM structure, both covered by E1; real-landmark classifier replay is 1B (1A keeps the untrained kNN placeholder).

## Five-question checklist on `1A-vertical-slice.impl.md`

1. **Placement** — every task names one owning component (Task 1 protocol; 2 gesture-core; 3 content; 4 offscreen; 5 background; 6 extension test). Cross-component work goes through a `protocol` message. ✓
2. **Boundary check** — each task carries a boundary-check line against its rule file; no task needs a disallowed import/API; no ADR required. ✓
3. **Interfaces** — Task 1 changes the `protocol` Zod schemas first; Tasks 3–5 change both sides after. ✓
4. **Principles** — §4 above; fast loop only, video contained, page hostile, replaceable seams. ✓
5. **Tests** — E1 (Task 2), E2 (Task 6), E3 (all), five contract tests (Tasks 1–2). No TODO hides an architectural question; the reserved direct port is a documented 1C deferral, not a stub. ✓

## Exit checks

Frozen at plan time. `scripts/milestone/exit-check 1A` runs these after every session; a later edit to this table or to a contract test it names is reported as `TAMPERED` (re-plan, never a quiet fix). `E` criteria are verbatim from the roadmap row §4.1 Exit cell (split at `;`); `I` rows are the items in "Interfaces fixed here".

| # | Criterion (verbatim) | Kind | Check |
|---|---|---|---|
| E1 | Fixture replay produces the expected `Intent` sequence | mechanical | `pnpm vitest run packages/gesture-core/test/replay-scroll.test.ts` |
| E2 | Playwright with a fake camera scrolls a test page | mechanical | `pnpm exec playwright test -c apps/extension/playwright.config.ts scroll-slice.e2e.ts` |
| E3 | boundary lint passes on all three components | mechanical | `node scripts/lint/boundary-lint.mjs` |
| I1 | GestureFrame | consumer:1B | `pnpm vitest run packages/protocol/test/contracts/gestureframe-v0.contract.test.ts` |
| I2 | Intent | consumer:1B,1C | `pnpm vitest run packages/protocol/test/contracts/1C-intent.contract.test.ts` |
| I3 | PageCommand | consumer:1C | `pnpm vitest run packages/protocol/test/contracts/1C-pagecommand.contract.test.ts` |
| I4 | PageEvent | consumer:1C | `pnpm vitest run packages/protocol/test/contracts/1C-pageevent.contract.test.ts` |
| I5 | FSM state tree + transition log | consumer:1C,2A | `pnpm vitest run packages/gesture-core/test/contracts/1C-fsm-state-tree.contract.test.ts` |

`I` contract tests are written from the consumer's side (what 1B/1C/2A read from each shape), assert through the owning package's public export, and are made to pass by execute without being edited. **I1 (GestureFrame, inherited from 0A) and I2 (Intent) are green at plan time** — their schemas are already final, so these rows are freeze guards; I3/I4/I5 fail today and execute (Tasks 1–2) makes them pass.

## Status

_Owned by the 1A session; rewritten, not appended._

**Done (session 0, plan):**
- Brainstorm (architectural path) → four owner questions batched and answered 2026-09-06, all as recommended (spec §4).
- Spec (`1A-vertical-slice.spec.md`), implementation plan (`1A-vertical-slice.impl.md`), this plan, the Exit checks table, and the four new contract tests written (`1C-intent` freeze guard + `1C-pagecommand`/`1C-pageevent`/`1C-fsm-state-tree` failing today).
- SDD workspace generated under `docs/sdd/1A/`.

**Done (execute session 1, Tasks 1–2):**
- Task 1 `[protocol]` (commit 17a4b87): lifted Intent's provisional marker (schema frozen `Arm|Pause|Scroll`, `dy`=signed CSS px); added `PageCommandSchema` (`{scroll,dy}`), `PageEventSchema` (`{ready,frameId}`), `TransitionLogEntrySchema` (`{ts,from,to,event,intent?}`), `PortName` constants (`OffscreenToContent` RESERVED). Contract tests I3/I4 + freeze guards I1/I2 green. Task review clean.
- Task 2 `[gesture-core]` (commits 1afe418..48481dc, 1 fix round): `Armed` compound state `{Idle,Scrolling}`; scroll `dy = Math.round(vy * SCROLL_PX_PER_UNIT)` (new tunable, v0=400); `createGestureRunner()`/`replayFrames()` replay surface returning per-frame `TransitionLogEntry` deltas (fix round 1 corrected `send()` from cumulative→per-frame per brief + Task 5 consumer). Contract I5 + E1 replay green. Task review clean after fix.
- `exit-check 1A --fast` @ 48481dc: 7 PASS (E1, E3, I1–I5), 1 FAIL (E2 — the scroll e2e does not exist until Task 6). Lock OK.

**Verified (execute session 2, reconcile):** Tasks 1–2 re-verified at 75193c0 — typecheck clean, vitest 67/67, `exit-check 1A --fast` 7 PASS / 1 FAIL (E2 pending Task 6), lock OK. No regression; ledger confirmed.

**In progress:** none.

**Next:** execute Tasks 3→6 in order (content → offscreen → background → e2e), one component per session; run `exit-check 1A --fast` after each. E2 (Playwright) goes green at Task 6.

**Blockers:** none.

**Proposed decision(s) for roadmap §8 (owner logs; agent does not edit §8):**

> | 2026-09-06 | **1A vertical-slice interfaces = FROZEN.** `protocol`: `GestureFrame` (0A, confirmed offscreen→SW payload), `Intent` (`Arm`/`Pause`/`Scroll{dy}`, `dy`=signed CSS px), `PageCommand` (`{scroll,dy}`), `PageEvent` (`{ready,frameId}`), `TransitionLogEntry` (`{ts,from,to,event,intent?}`), hierarchical FSM `Paused`/`Armed.{Idle,Scrolling}` (arch §5 names as additive target), `PortName` constants. Scroll dispatch = content-script `scrollBy` (not CDP; CDP stays the click default, 1C). Port topology: offscreen→SW + SW→CS wired; direct offscreen→CS port RESERVED, live `PointerUpdate` wiring deferred to 1C (offscreen lacks `chrome.tabs` → SW-brokered `MessageChannel`; ADR then if infeasible). 1B/1C/1D/2A extend, none redefines. | G1, G5, G8(prov); owner answers 2026-09-06 (spec §4) | Fixed in `docs/plans/1A-vertical-slice.md`; consumed by 1B/1C/1D/2A |
