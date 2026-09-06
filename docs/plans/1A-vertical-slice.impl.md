# 1A — Vertical slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `obra-subagent-driven-development` (recommended) or `obra-executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. One execute session per task in the 1A worktree; each task is one commit whose body first line is `[<component>] task <N>: <title>`. Do not re-open placement or the interfaces fixed in `1A-vertical-slice.spec.md`.

**Goal:** Ship one gesture end to end — **fist scroll** — through the real component seam (offscreen → service worker → content script), and in doing so **freeze** the shared interfaces `GestureFrame`, `Intent`, `PageCommand`, `PageEvent`, the FSM state tree + transition-log shape, and the port topology. Fixture replay produces the expected `Intent` sequence; a Playwright fake-camera e2e scrolls a test page; boundary lint passes on all three components.

**Architecture:** All cross-boundary shapes are Zod schemas in `packages/protocol` (changed first, then both sides). `packages/gesture-core` owns the FSM (hierarchical `Paused`/`Armed.{Idle,Scrolling}`), all gesture timing, and the transition-log derivation. The offscreen inference worker derives a `GestureFrame` from landmarks and offscreen-main relays it over a `runtime.Port` to the service worker; the SW runs the machine, maps a `Scroll` `Intent` to a `PageCommand{type:'scroll'}`, and sends it over a per-tab port to the content script, which does `window.scrollBy`. Pointer/cursor and the direct offscreen→content port are **not** in 1A (deferred to 1C).

**Tech Stack:** pnpm + Turborepo; TypeScript strict; Zod v4; XState v5; WXT + React (extension); Vitest + happy-dom; Playwright (fake device y4m); `@mediapipe/tasks-vision`. No new runtime dependency (nothing to add to `docs/03-tech-stack.md`).

**Spec:** `docs/plans/1A-vertical-slice.spec.md` (read it alongside this plan). **Exit checks:** `docs/plans/1A-vertical-slice.md ## Exit checks`.

## Global Constraints

Owning rule files (every task's boundary check runs against these; a violation is a blocker unless an ADR is linked): `.claude/rules/protocol.md`, `.claude/rules/gesture-core.md`, `.claude/rules/offscreen.md`, `.claude/rules/content.md`, `.claude/rules/background.md`, `.claude/rules/fixtures-and-tests.md`.

- TypeScript **strict**; no `any`, no `@ts-ignore` without an ADR (CLAUDE.md §2).
- `packages/protocol` depends on **`zod` only**; every cross-boundary shape is defined there first, then both sides change.
- **All** gesture timing/hysteresis/cooldown/confidence gating and the transition-log derivation live in `packages/gesture-core` and nowhere else (`gesture-core.md`, CLAUDE.md §2). The vy→px scroll conversion constant is a tunable in `gesture-core/constants.ts` — no gesture-timing constant may appear in the offscreen, background, or content code.
- **Video containment:** `VideoFrame`/`ImageBitmap`/raw landmarks never leave the offscreen document; only `GestureFrame` crosses the port, and it omits `landmarks` in steady state (`offscreen.md`, boundary-lint rule 1).
- **Validate every inbound port message** with the `protocol` Zod schema before acting: the SW validates each `GestureFrame` and each `PageEvent`; the content script validates each `PageCommand` (`background.md`, `content.md`, arch §7 "page is hostile").
- **Scroll dispatch is content-script `scrollBy`**, not CDP (spec §4 Q1; arch §3.2). No `debugger` permission is added in 1A. The `background.md` "CDP is the primary input path" line concerns trusted input *events* (clicks/keys), delivered in 1C.
- The content script uses `browser.runtime` port messaging only; it must not touch `chrome.storage`, `chrome.debugger`, or `fetch`, hold a secret, or run an action the SW did not send (`content.md`).
- Packages export only via `package.json` `exports`; no deep imports. Names come from `02-architecture §5/§6`; no synonyms.
- Playwright always launches with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<y4m from fixtures/>` (`fixtures-and-tests.md`).

**Contract tests already present (written by the plan session, FROZEN — execute makes them pass and must NEVER edit them):**
`packages/protocol/test/contracts/1C-intent.contract.test.ts` (freeze guard, green), `.../1C-pagecommand.contract.test.ts`, `.../1C-pageevent.contract.test.ts`, and `packages/gesture-core/test/contracts/1C-fsm-state-tree.contract.test.ts`. `GestureFrame` is guarded by the inherited `.../gestureframe-v0.contract.test.ts` (0A). Tasks 1 and 2 make the failing ones pass without modifying any of them.

---

### Task 1: `protocol` — freeze Intent; add PageCommand, PageEvent, TransitionLogEntry, port names

**Files:**
- Create: `packages/protocol/src/page-command.ts`, `packages/protocol/src/page-event.ts`, `packages/protocol/src/transition.ts`, `packages/protocol/src/ports.ts`
- Modify: `packages/protocol/src/intent.ts` (lift the "PROVISIONAL" marker; document `dy` = signed CSS pixels), `packages/protocol/src/index.ts` (export the four new modules)
- Test: `packages/protocol/test/schemas.test.ts` (add unit cases for `PageCommand`, `PageEvent`, `TransitionLogEntry`)
- Contract (make pass, do NOT edit): `packages/protocol/test/contracts/1C-intent.contract.test.ts`, `.../1C-pagecommand.contract.test.ts`, `.../1C-pageevent.contract.test.ts`

**Steps:**
- [ ] `intent.ts`: remove the "PROVISIONAL v0 — 1A finalizes" comment; replace with a note that the union is FROZEN (members `Arm | Pause | Scroll`), that `Scroll.dy` is **signed CSS pixels** (positive = scroll down), and that later milestones ADD members only. Keep the schema (`dy: z.number()`) unchanged.
- [ ] `page-command.ts`: `export const PageCommandSchema = z.discriminatedUnion('type', [ z.object({ type: z.literal('scroll'), dy: z.number() }) ]); export type PageCommand = z.infer<typeof PageCommandSchema>;` with a comment that arch §6's `pointer`/`highlight`/`preview`/`snapshot`/`fallbackClick` are added by 1C/2A, none redefining `scroll`.
- [ ] `page-event.ts`: `export const PageEventSchema = z.discriminatedUnion('type', [ z.object({ type: z.literal('ready'), frameId: z.number() }) ]); export type PageEvent = z.infer<typeof PageEventSchema>;` comment: `hover`/`snapshot` added by 1C/2A.
- [ ] `transition.ts`: import `IntentSchema`; `export const TransitionLogEntrySchema = z.object({ ts: z.number(), from: z.string(), to: z.string(), event: z.string(), intent: IntentSchema.optional() }); export type TransitionLogEntry = z.infer<...>;` comment: event-sourced FSM log for diagnostics (1D.5) and replay tests (arch §3.2).
- [ ] `ports.ts`: `export const PortName = { OffscreenToServiceWorker: 'offscreen->sw', ServiceWorkerToContent: 'sw->content', OffscreenToContent: 'offscreen->content' } as const; export type PortName = (typeof PortName)[keyof typeof PortName];` Comment `OffscreenToContent` as RESERVED — live PointerUpdate wiring lands in 1C via a SW-brokered `MessageChannel` (offscreen has no `chrome.tabs`).
- [ ] `index.ts`: add `export * from './page-command.js'; './page-event.js'; './transition.js'; './ports.js'`.
- [ ] `schemas.test.ts`: add parse/reject cases for the three new schemas.

**Boundary check:** protocol depends on `zod` only; `transition.ts` imports `IntentSchema` (same package, fine); no app/other-package imports. ✓
**Verification:** `pnpm vitest run packages/protocol/test/contracts/1C-intent.contract.test.ts packages/protocol/test/contracts/1C-pagecommand.contract.test.ts packages/protocol/test/contracts/1C-pageevent.contract.test.ts` green; `pnpm --filter @gesture/protocol typecheck` clean.

---

### Task 2: `gesture-core` — hierarchical FSM, transition log, replay surface, scroll in CSS px

**Files:**
- Modify: `packages/gesture-core/src/machine.ts` (make `Armed` a compound state with `Idle` + `Scrolling`; enter `Scrolling` on confident fist, emit `Scroll` with `dy` in CSS px while scrolling, return to `Idle` on fist release; keep palm-clutch `Arm`/`Pause`)
- Modify: `packages/gesture-core/src/constants.ts` (add `SCROLL_PX_PER_UNIT` — vy(normalized/s)→CSS px conversion tunable; keep `PALM_CLUTCH_MS`, `SCROLL_STEP`, `MIN_CONFIDENCE`)
- Modify: `packages/gesture-core/src/replay.ts` (add `createGestureRunner()` and `replayFrames(frames)` — see steps; keep `replayFixture`)
- Modify: `packages/gesture-core/src/index.ts` (export `replayFrames`, `createGestureRunner`)
- Test: `packages/gesture-core/test/machine.test.ts` (extend for the substates + Pause-from-Armed still works), `packages/gesture-core/test/replay-scroll.test.ts` (NEW — Exit E1)
- Contract (make pass, do NOT edit): `packages/gesture-core/test/contracts/1C-fsm-state-tree.contract.test.ts`

**Steps:**
- [ ] `machine.ts`: convert `Armed` to `{ initial: 'Idle', states: { Idle: {...}, Scrolling: {...} } }`. `Idle`→`Scrolling` on `shouldScroll` (confident fist + |vy| ≥ `SCROLL_STEP`); in `Scrolling`, each qualifying fist frame re-emits `Scroll`; `Scrolling`→`Idle` when fist released. Keep `Paused`⇄`Armed` on `clutchElapsed` (Arm/Pause). `Scroll.dy = Math.round(vy * SCROLL_PX_PER_UNIT)` (CSS px, signed). Keep all timing here.
- [ ] `constants.ts`: add `export const SCROLL_PX_PER_UNIT = <v0 placeholder>;` with a comment that it is a fixture-tunable, not a plan constant.
- [ ] `replay.ts`: add `createGestureRunner()` returning `{ send(frame: FrameInput): { intents: Intent[]; transitions: TransitionLogEntry[] } }`. Internally: create+start an actor, subscribe to state changes and `on('Arm'|'Pause'|'Scroll')`; for each `send`, capture the prior state value, send the `FRAME`, then return the intents emitted and a `TransitionLogEntry` (`{ ts: frame.ts, from, to, event: 'FRAME', intent? }`) whenever the state value changed or an intent was emitted (`from`/`to` are the dotted state path, e.g. `'Paused'`, `'Armed.Idle'`, `'Armed.Scrolling'`). Add `replayFrames(frames: FrameInput[]): { intents; transitions }` as a thin loop over `createGestureRunner`. The SW (Task 5) reuses `createGestureRunner` for the live log — one owner for timing AND log shape.
- [ ] `index.ts`: export `replayFrames`, `createGestureRunner`.
- [ ] `replay-scroll.test.ts` (E1): drive a scripted `FrameInput` sequence (palm-hold ≥ `PALM_CLUTCH_MS` → `Arm`; then fist + vy ≥ threshold → `Scroll`×N) through `replayFrames`; assert `intents` == `[Arm, Scroll, Scroll, ...]` and that `transitions` includes `Paused`→`Armed.*` (intent `Arm`) and `Armed.Idle`→`Armed.Scrolling`.

**Boundary check:** gesture-core depends on pure TS, `xstate`, `zod`, `@gesture/protocol` types (`Intent`, `TransitionLogEntry`, `FrameInput` stays local); no DOM/`chrome.*`/`fetch`/timers-outside-XState. ✓
**Verification:** `pnpm vitest run packages/gesture-core/test/contracts/1C-fsm-state-tree.contract.test.ts packages/gesture-core/test/replay-scroll.test.ts packages/gesture-core/test/machine.test.ts` green; typecheck clean.

---

### Task 3: `content` — execute scroll PageCommand; announce ready

**Files:**
- Modify: `apps/extension/entrypoints/content/index.ts`
- Test: `apps/extension/test/content-scroll.test.ts` (happy-dom unit)

**Steps:**
- [ ] On load, `browser.runtime.connect({ name: PortName.ServiceWorkerToContent })` (or accept the SW-initiated port — pick one and document; connecting from the content script on injection is simplest under MV3) and post a `PageEvent` `{ type: 'ready', frameId }` (`frameId` from `browser.runtime` frame context; `0` for the top frame in 1A — `all_frames` handling is 1C).
- [ ] `port.onMessage`: `PageCommandSchema.safeParse(msg)`; on a valid `{type:'scroll', dy}`, `window.scrollBy({ top: dy })`. Ignore invalid messages (page is hostile).
- [ ] No gesture timing, no `chrome.storage`/`debugger`/`fetch`, no secret, no action not sent by the SW.
- [ ] `content-scroll.test.ts`: given a valid scroll `PageCommand`, asserts `window.scrollBy` called with the `dy`; an invalid command is ignored; a `ready` `PageEvent` is posted on init.

**Boundary check:** depends on `protocol` + DOM + `browser.runtime` messaging only (the `content.md` "Must never" list — storage/debugger/fetch/secrets/framework — is respected; `browser.runtime` port messaging is how the SW reaches the content script and is not forbidden). Validates every `PageCommand`. ✓
**Verification:** `pnpm --filter @gesture/extension exec vitest run test/content-scroll.test.ts`; `node scripts/lint/boundary-lint.mjs`.

---

### Task 4: `offscreen` — derive & publish GestureFrame; add the test-only injection hook

**Files:**
- Create: `apps/extension/entrypoints/offscreen/gesture-frame.ts` (compose gesture-core: normalize → 1€ filter → features → classifier → `GestureFrame`)
- Modify: `apps/extension/entrypoints/offscreen/inference.worker.ts` (after `detectForVideo`, build a `GestureFrame` via `gesture-frame.ts` and post it to offscreen-main alongside the existing stats), `apps/extension/entrypoints/offscreen/main.ts` (open `browser.runtime.connect({ name: PortName.OffscreenToServiceWorker })`; relay each `GestureFrame` over it; add the test-only hook)
- Test: `apps/extension/test/offscreen-gestureframe.test.ts` (unit: landmarks → a schema-valid `GestureFrame`, `landmarks` omitted in steady state)

**Steps:**
- [ ] `gesture-frame.ts`: pure function `toGestureFrame(landmarks, prev, ts, ...) : GestureFrame` using `normalizeLandmarks`, `OneEuroFilter`, `pinchDistance`/`fingerExtension`, and the `KnnClassifier` (unchanged placeholder → `gesture:'none'` until 1B). Omit `landmarks` from the output (steady state; video containment).
- [ ] `inference.worker.ts`: build the `GestureFrame` per frame and `postMessage({ type: 'frame', frame })` to main. Keep the fps stat path. Do NOT post raw `VideoFrame`/landmarks out of the worker.
- [ ] `main.ts`: connect the `OffscreenToServiceWorker` port; on each worker `frame` message, `port.postMessage(frame)`. Keep the existing `PumpStat`/`PumpError` `sendMessage` path.
- [ ] Test-only hook, gated by `import.meta.env.VITE_TEST_HOOKS === '1'` (never set by `wxt build` production): when set, `browser.runtime.onMessage` accepts `{ type: '__inject_frames', frames: GestureFrame[] }` and posts each over the `OffscreenToServiceWorker` port, so a Playwright test can drive a deterministic gesture without a trained classifier. Absent/stripped from production output.

**Boundary check:** offscreen depends on `@mediapipe/tasks-vision`, `gesture-core`, `protocol`, runtime Port; no network/`chrome.storage`/`chrome.debugger`; no gesture-timing constant here (all in gesture-core); video/frames/landmarks never leave (only `GestureFrame`, no `landmarks`). ✓
**Verification:** `pnpm --filter @gesture/extension exec vitest run test/offscreen-gestureframe.test.ts`; `node scripts/lint/boundary-lint.mjs` (video-containment rule).

---

### Task 5: `background` (service worker) — consume GestureFrame, run FSM, dispatch scroll

**Files:**
- Create: `apps/extension/entrypoints/background/fsm.ts` (adapt `GestureFrame`→`FrameInput`, drive `createGestureRunner`, persist `TransitionLogEntry[]` + latest state to `chrome.storage.session`), `apps/extension/entrypoints/background/dispatcher.ts` (`Intent`→`PageCommand`; `Scroll`→`{type:'scroll',dy}` to the active tab's content port), `apps/extension/entrypoints/background/ports.ts` (registry: the offscreen port + per-tab content ports keyed by `frameId`/`tabId`)
- Modify: `apps/extension/entrypoints/background.ts` (accept `OffscreenToServiceWorker` and `ServiceWorkerToContent` port connections; validate every inbound `GestureFrame`/`PageEvent` with the Zod schema; wire fsm→dispatcher; keep the existing camera-gate/offscreen/pump logic untouched)
- Test: `apps/extension/test/dispatcher.test.ts` (a `Scroll` intent → a `{type:'scroll',dy}` `PageCommand` sent to the content port), `apps/extension/test/fsm-wiring.test.ts` (a `GestureFrame` sequence → the expected intents + a persisted transition log)

**Steps:**
- [ ] `background.ts`: `browser.runtime.onConnect` — dispatch by `port.name`: `OffscreenToServiceWorker` → validate each message `GestureFrameSchema.safeParse`, feed `fsm.ts`; `ServiceWorkerToContent` → register the content port, validate `PageEventSchema` (`ready`) before use.
- [ ] `fsm.ts`: map `GestureFrame`→`FrameInput` (subset), `runner.send(frame)`, forward emitted `Intent`s to the dispatcher, append `TransitionLogEntry`s to a bounded `chrome.storage.session` series (reuse the `MAX_SERIES` bounding pattern already in `background.ts`).
- [ ] `dispatcher.ts`: `Scroll` → `PageCommandSchema.parse({ type:'scroll', dy })` → post to the active tab's content port. (Arm/Pause update stored FSM state; no page command in 1A.)
- [ ] `ports.ts`: hold the offscreen port and a `Map` of content ports; clean up on `onDisconnect`.
- [ ] Validate **every** inbound port message with the protocol schema before acting (`background.md`).

**Boundary check:** background depends on `gesture-core`, `protocol`, `chrome.*`; no DOM/React/MediaPipe; no secret in `storage.local/sync` (transition log is diagnostic, `storage.session`, not a secret); validates every inbound message. Scroll dispatch is content-script `scrollBy` via `PageCommand` (no CDP, no `debugger`). ✓
**Verification:** `pnpm --filter @gesture/extension exec vitest run test/dispatcher.test.ts test/fsm-wiring.test.ts`; `node scripts/lint/boundary-lint.mjs`.

---

### Task 6: `extension` — Playwright e2e: fake camera scrolls a test page (Exit E2)

**Files:**
- Create: `apps/extension/test/scroll-slice.e2e.ts`, `apps/extension/test/fixtures/scroll-page.html` (a tall page whose scroll position the test reads)
- Modify: `apps/extension/playwright.config.ts` (add `{ name: 'scroll-slice', testMatch: '**/scroll-slice.e2e.ts' }`)

**Steps:**
- [ ] Build the unpacked extension with `VITE_TEST_HOOKS=1` (so the offscreen injection hook is present) — follow the `frame-pump.e2e.ts` build-then-launch pattern (`execFileSync` build; persistent context; fake-camera flags + `--use-file-for-fake-video-capture=<fixtures/bench/placeholder.y4m>`).
- [ ] Open `scroll-page.html` (as an extension-hosted or `file://` test page reachable by the content script), wait for the content script's `ready`.
- [ ] Send `{ type: '__inject_frames', frames }` to the offscreen document — a scripted `GestureFrame` sequence (palm-hold → `Arm`; fist + vy → `Scroll`×N).
- [ ] Assert the page's `window.scrollY` increased (the slice scrolled the page end to end).
- [ ] Confirm production `wxt build` (no `VITE_TEST_HOOKS`) does not contain the `__inject_frames` string (optional guard; can be a boundary-lint follow-up).

**Boundary check:** test-only; the hook it exercises is stripped from production (Task 4). Uses the mandated fake-camera flags. ✓
**Verification:** `pnpm exec playwright test -c apps/extension/playwright.config.ts scroll-slice.e2e.ts` green.

---

## Notes for the executor
- The interfaces are frozen in `1A-vertical-slice.md`; do not re-open them. Additive extension by later milestones is expected; redefinition is a re-plan.
- `replayFixture` (raw landmarks → classifier) stays for 1B; 1A's replay/e2e use scripted frames because the kNN placeholder is untrained and a fixture carries one label per record (spec §2, §5).
- The direct offscreen→content-script port is reserved only (`PortName.OffscreenToContent`); do not wire it live — that is 1C.

## Self-review
- Five questions answered in `1A-vertical-slice.md`. ✓ Placement: three components + protocol messages. ✓ Boundaries: checked per task against the six rule files. ✓ Interfaces: protocol schemas first (Task 1), then both sides (Tasks 3–5). ✓ Principles: fast loop only, video contained, page hostile, replaceable parts. ✓ Tests: E1 replay, E2 e2e, E3 boundary lint, five frozen contract tests.
- No new runtime dependency. No `any`/`@ts-ignore`. No gesture-timing constant outside gesture-core. No secret anywhere. No CDP/`debugger` in 1A.
