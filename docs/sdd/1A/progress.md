# SDD ledger — plan: docs/plans/1A-vertical-slice.impl.md

Milestone 1A, execute session 1. Owns Tasks 1 (`protocol`) and 2 (`gesture-core`) per `.claude/scope.json`.
Spec: `docs/plans/1A-vertical-slice.spec.md` (binding authority). SDD workspace: `docs/sdd/1A-vertical-slice/`.

## Preflight scan

| Pair / task | produces → consumes | Finding |
|---|---|---|
| Task 1 → Task 2 | Task 1 exports `TransitionLogEntry`/`Intent` from `@gesture/protocol`; Task 2 imports them | Sequential dependency, correct order (1 before 2). No shared files. Clean. |
| Task 1 self | new schemas + `schemas.test.ts` cases vs frozen contract tests `1C-{intent,pagecommand,pageevent}` | Contract tests already exist and must be made to pass unedited. Consistent. |
| Task 2 self | compound `Armed` vs existing `machine.test.ts` asserting `value === 'Armed'` | Existing assertions break once `Armed` is compound (value becomes `{Armed:'Idle'}`). Plan explicitly says extend `machine.test.ts` for substates — implementer must update those assertions. Expected, not a conflict. |
| Task 2 self | `dy = Math.round(vy * SCROLL_PX_PER_UNIT)` (px) vs current `Math.round(vy / SCROLL_STEP)` | Constant/threshold change → fixture replay is the failing test; `replay-scroll.test.ts` (E1, created in Task 2) is that replay. Consistent. |

Scan clean; no cross-task contradiction. Sequential dispatch 1 → 2.

## Tasks

Base before Task 1: 76503d9
Task 1: complete (commits 76503d9..17a4b87, review clean) — protocol schemas; 31 tests pass, typecheck clean.
Note: `packages/protocol` `exports` resolve through `dist/` — consumers must `pnpm build` after protocol src changes or tests run against stale dist. Carried into Task 2 dispatch.

Base before Task 2: 17a4b87
Task 2: implemented (commit 1afe418) — compound FSM + replay; 19/19 pass, typecheck clean.
Task 2 review: Spec ❌ (Critical), Quality ✅. Critical: `createGestureRunner().send()` returns cumulative history across all calls, but brief requires per-frame delta ("return the intents emitted" for that send); Task 5 (SW live log) reuses `createGestureRunner` and needs per-frame deltas (unbounded growth otherwise). Minor (deferred): `emitted[0]` single-intent attach — matches brief's singular `intent?`, not a defect. Fix round 1 dispatched.
Task 2 fix-base (review head): 1afe418
Task 2: fix round 1/5 (1 addressed, 0 open — send() now per-frame delta, replayFrames accumulates; +2 per-frame tests; commits 1afe418..48481dc)
Task 2: complete (commits 17a4b87..48481dc, review clean) — 21/21 gesture-core tests pass, typecheck clean.

Both owned tasks (1, 2) complete. Tasks 3-6 (content, offscreen, background, e2e) remain for later sessions → CONTINUE.

## Session 2 (reconcile)
Verified committed Tasks 1–2 at 75193c0 (owner answer #2): typecheck clean, vitest 67/67 green, exit-check 7 PASS / 1 FAIL (E2 pending Task 6), lock OK. No regression, no ledger change needed beyond this note. Session 3 does Task 3.

Deferred minor (for final whole-branch review at Task 6): replay.ts `emitted[0]` single-intent attach on TransitionLogEntry — matches brief's singular `intent?`; revisit only if the machine ever adds multi-intent transitions.

## Session 3 (execute Tasks 3–4)
Owns Tasks 3 (`content`) and 4 (`offscreen`) per `.claude/scope.json`. Base before Task 3: 8fd7727.

### Preflight scan (Tasks 3–4)
| Pair / task | produces → consumes | Finding |
|---|---|---|
| Task 3 ↔ Task 4 | disjoint files (content/** vs offscreen/**); both consume frozen `protocol` (Task 1) + `PortName`; Task 4 also consumes `gesture-core` (Task 2, complete) | No shared file, no interface contradiction. Independent; dispatch sequentially (git index). Clean. |
| Task 3 → Task 5 (next session) | content CONNECTS `ServiceWorkerToContent`, posts `PageEvent{ready,frameId}`; Task 5 SW `onConnect` accepts that port + validates `PageEvent` | Direction agrees (content-initiated connect, SW accepts). Consistent. |
| Task 4 → Task 5 (next session) | offscreen CONNECTS `OffscreenToServiceWorker`, relays `GestureFrame`; Task 5 SW accepts + validates `GestureFrameSchema` | Direction + payload agree. Consistent. |
| Task 3 self | scroll exec + ready-post vs `content-scroll.test.ts` (happy-dom) | index.ts calls wxt global `defineContentScript` at load → not vitest-importable. Ruling: extract validate+scroll+ready logic into a pure sibling module the test imports; index.ts wires the port. happy-dom via per-file `// @vitest-environment happy-dom` docblock (declared at root package.json ^15; no lockfile change). Cost if wrong: a helper file + docblock to undo. |
| Task 4 self | `toGestureFrame` pure fn vs `offscreen-gestureframe.test.ts` | Pure module isolated per plan; classifier untrained → `gesture:'none'`; assert schema-valid + `landmarks` omitted. Consistent. |

Scan clean; sequential dispatch 3 → 4.

### Tasks
Base before Task 3: 8fd7727
Task 3: implemented (commit ddf67e6) — content script connects `ServiceWorkerToContent`, posts `ready` PageEvent, validates+executes scroll PageCommand via `window.scrollBy`; pure logic in new `content/scroll.ts`; 5/5 happy-dom tests, boundary-lint OK.
Task 3 review: Spec ✅, Quality Approved (sonnet). No Critical/Important. Two deferred minors below.
Task 3: complete (commits 8fd7727..ddf67e6, review clean). exit-check 1A --fast @ ddf67e6: 7 PASS / 1 FAIL (E2 pending Task 6), E3 boundary lint still PASS with wired content, lock OK.
Task 3: minor (deferred): `applyPageCommand` passes only `{top:dy}` to scrollBy (no `left`/`behavior`) — matches brief; harmless.
Task 3: minor (deferred, ⚠️ unverifiable from diff): manifest-level port wiring (`browser.runtime.connect` under real WXT build) not exercised — unit test + boundary lint were the specified verification; integration proven by Task 6 e2e.

Ruling: Task 3 testability — extract content scroll/ready logic into a pure sibling module (`content/scroll.ts`) so the happy-dom unit test avoids the `defineContentScript` global; index.ts wires it. Why: matches the codebase's pure-helper test pattern (fps-logger/permission). Cost if wrong: one small file to fold back.

Base before Task 4: ddf67e6
Task 4: implemented (commit fe11f4b) — added `@gesture/gesture-core` dep to the extension; new `offscreen/gesture-frame.ts` `createGestureFrameSource()` composing normalize→1€→features→classifier into a schema-valid `GestureFrame` (landmarks omitted); worker flattens hand[0]→number[63] locally and posts only `{type:'frame',frame}`; main.ts opens the `OffscreenToServiceWorker` port, relays frames, and adds the fully-`VITE_TEST_HOOKS`-gated `__inject_frames` hook. 3/3 new tests, full extension suite 20/20, boundary-lint OK, tsc clean.
Task 4 review: Spec ✅, Quality Approved (sonnet). No Critical/Important. Three deferred minors below.
Task 4: complete (commits ddf67e6..fe11f4b, review clean). exit-check 1A --fast @ fe11f4b: 7 PASS / 1 FAIL (E2 pending Task 6), E3 boundary lint PASS (video-containment) with offscreen wired, lock OK.
Task 4: minor (deferred): `gesture-frame.ts` calls `pinchDistance`/`fingerExtension` on already-normalized landmarks though those helpers re-derive their own scale — mathematically inert (÷≈1) but redundant; pass raw landmarks instead.
Task 4: minor (deferred): velocity across an absent-hand gap can spike (prevTs updated on absent frames, filter gap untracked) — harmless (1B FSM owns hysteresis); add a one-line comment noting the accepted approximation.
Task 4: minor (deferred, implementer-flagged): pointer is raw uncalibrated MediaPipe image-space, not the arch §3.1 viewport-mapped pointer — out of scope for 1A (no pointer consumer yet); track for the calibration owner.

Both owned tasks (3, 4) complete → CONTINUE. Tasks 5 (background) and 6 (e2e) remain for later sessions. The five Task-3/4 deferred minors above are carried to the final whole-branch review (at Task 6).

## Session 4 (execute Tasks 5–6)
Owns Tasks 5 (`background`) and 6 (`extension` e2e) per `.claude/scope.json`. Base before Task 5: eb621c2.

### Preflight scan (Tasks 5–6)
| Pair / task | produces → consumes | Finding |
|---|---|---|
| Task 4 → Task 5 | offscreen connects `OffscreenToServiceWorker`, posts raw `GestureFrame` objects; Task 5 SW `onConnect` accepts that port, `GestureFrameSchema.safeParse` each, feeds FSM | Offscreen-initiated connect, SW validates. Direction + payload agree. Consistent. |
| Task 3 → Task 5 | content connects `ServiceWorkerToContent`, posts `PageEvent{ready,frameId:0}`; Task 5 SW registers that content port, `PageEventSchema.safeParse` before use | SW is the port registry; direction agrees. Consistent. |
| Task 5 → Task 6 | Task 5 completes the SW middle (FSM + dispatch to content port); Task 6 injects scripted `GestureFrame`s at the offscreen hook → asserts page scrolls end-to-end over the wired slice (Tasks 3,4,5) | Sequential dependency 5→6. Consistent. |
| Task 5 self | `background.ts` calls the wxt `defineBackground` global at module load (not vitest-importable) vs `dispatcher.test.ts`/`fsm-wiring.test.ts` | Same ruling as Tasks 3/4: extract pure logic into the three sibling modules the plan already prescribes (`background/fsm.ts`, `dispatcher.ts`, `ports.ts`) that the tests import; `background.ts` only wires them via `onConnect`. Ruling: `fsm`/`dispatcher` take an injectable port-target + storage so tests need no `chrome.*`. Cost if wrong: a small module seam to refold. |
| Task 5 self | GestureFrame→FrameInput mapping vs `createGestureRunner().send(FrameInput)` (Task 2, complete) | `GestureFrame` is a superset of `FrameInput` (`{ts,present,gesture?,score,velocity}`); the map is a field subset. `send` returns a per-frame `{intents,transitions}` delta; SW accumulates transitions into a bounded `storage.session` series. Consistent. |
| Task 6 self | injected `GestureFrame` must pass `GestureFrameSchema` AND drive the FSM to `Scroll` | Frames crafted with `gesture:'Open_Palm'`/`'Closed_Fist'` (valid `GestureLabel`), `score≥MIN_CONFIDENCE(0.5)`, palm ts-span ≥ `PALM_CLUTCH_MS(1000)`, fist `velocity.vy≥SCROLL_STEP(0.02)`. Ruling: the e2e imports these constants from `@gesture/gesture-core` rather than hardcoding them — no second source of timing truth (CLAUDE.md §2). Consistent. |

Scan clean; sequential dispatch 5 → 6.

### Tasks
Base before Task 5: eb621c2
Task 5: implemented (commit ebf9db0) — new `background/dispatcher.ts` (`dispatchIntent`: `Scroll`→`PageCommandSchema.parse({type:'scroll',dy})` to an injected `CommandTarget`; Arm/Pause no-op in 1A), `background/ports.ts` (`createPortRegistry`: single offscreen port + `Map<tabId,port>` content ports, `onDisconnect` cleanup, `currentContentTarget()`), `background/fsm.ts` (`toFrameInput` GestureFrame→FrameInput subset; `createFrameConsumer({dispatch,persist})` owns one `createGestureRunner`); `background.ts` additive `onConnect` wiring — validates each inbound msg (`GestureFrameSchema`/`PageEventSchema` safeParse) before acting, feeds FSM, persists `TransitionLogEntry[]` to `storage.session` (reused `MAX_SERIES` bound). 7/7 focused + 27/27 suite, typecheck clean, boundary-lint OK. Pre-existing camera/pump code untouched (additive diff).

Task 5 review: Spec ✅, Boundary gate PASS (background.md), Task quality Approved (sonnet). No Critical/Important. One ⚠️ (PageEventSchema.safeParse result discarded — controller-resolved: NOT a gap; brief says "validate before use" and 1A has no consumer of `ready` yet, so validation-with-no-consumer is the intended scope). Two deferred minors below.
Task 5: complete (commits eb621c2..ebf9db0, review clean). exit-check pending (run after Task 5 per brief step 0).
Task 5: minor (deferred): `ports.ts` tabId-keying fallback (monotonic id when `sender.tab.id` absent) + `onDisconnect` cleanup have no dedicated `ports.test.ts` — exercised only indirectly via test doubles; Task 6 e2e covers the wired whole.
Task 5: minor (deferred): `background.ts:183-184` `PageEventSchema.safeParse(message)` result is unused (intentional no-op until a `ready` consumer exists) — a `void`/`// TODO(1B): gate on ready` would mark the intent explicit.

Base before Task 6: ebf9db0
Task 6: implemented (commit c708f42) — `apps/extension/test/scroll-slice.e2e.ts` builds the extension with `VITE_TEST_HOOKS=1`, launches a persistent context with the fake camera (`--use-fake-device/-ui-for-media-stream` + y4m), serves a tall `test/fixtures/scroll-page.html` over a node `http` server, injects a scripted palm-hold→fist `GestureFrame` sequence via `sw.evaluate(chrome.runtime.sendMessage({type:'__inject_frames',...}))`, and asserts `window.scrollY > 0` (reached 240). Timing derived from `@gesture/gesture-core` constants (no literal duplication). `playwright.config.ts` gains the `scroll-slice` project. E2 now green. Concerns: shared `.output/chrome-mv3` build dir (safe: E2 runs this spec in isolation); fixed 2s content-ready settle wait (frame-pump style).

Task 6 review: Spec ✅, Boundary gate PASS (fixtures-and-tests.md), Task quality Approved (sonnet). One "Important" the reviewer itself self-adjudicated as "not a defect in this diff / no fix required" (shared `.output/chrome-mv3` build dir is safe only while `workers:1` and no `*_SKIP_BUILD` env are set); two Minor; one ⚠️ (tsc/boundary-lint accepted as reported, not re-run).
Task 6: Ruling — the shared-`.output` "Important" is parked, not fixed: it is not a defect in the Task-6 diff (reviewer concurs), does NOT affect the frozen E2 check (which runs `scroll-slice.e2e.ts` in isolation, never alongside frame-pump), and is contingent on future config changes outside this diff. Cost if wrong: a future combined multi-project run with a `*_SKIP_BUILD` env could load a test-hooks build into frame-pump — caught the moment such a run is added, fixed then with a distinct outDir. Carried to the final whole-branch review.
Task 6: complete (commits ebf9db0..c708f42, review clean; 1 parked). exit-check 1A --fast @ c708f42: 8 PASS / 0 FAIL (E2 now green). Lock OK.
Task 6: minor (deferred): fixed 2s content-ready settle wait (frame-pump precedent) — could poll for the `ready` PageEvent instead.

Both owned tasks (5, 6) complete → all six 1A tasks done. Dispatching the final whole-branch review (merge-base ee767de..c708f42) to triage every deferred minor.

Ruling (bookkeeping): the worker writes this prose ledger; the slug-path table ledger (`docs/sdd/1A-vertical-slice/progress.md`) State/Commit for Tasks 5–6 is left to the driver's standing authorization (session-3 answer #1). Cost if wrong: a stale State row the driver already owns fixing.

### Final whole-branch review (opus, merge-base ee767de..c708f42)
**Ready to merge — Yes.** No Critical, no Important. All three focus invariants verified by direct code inspection: (a) the frozen seam is coherent both directions (offscreen `GestureFrame` ↔ background `GestureFrameSchema` ↔ gesture-core `FrameInput`; background `PageCommand` ↔ content validate+`scrollBy`), and `gesture` is always a valid `GestureLabel` (`'none'` fallback in the enum) so no valid frame is dropped at validation; (b) video/landmark containment holds (worker flattens hand[0]→number[63], `frame.close()`s the `VideoFrame`, posts only landmarks-less `GestureFrame`); (c) single-owner timing — no gesture-timing constant in offscreen/background/content production code. All 9 logged deferred minors triaged **correctly deferred**. Four new Minor (non-blocking, deferred to 1B/1C hygiene):
- `scroll-slice.e2e.ts:11` unused import `SCROLL_PX_PER_UNIT` (referenced only in a comment) — dead, harmless (test/ not linted, `noUnusedLocals` off).
- `scroll-slice.e2e.ts:110` comment says "positive vy → scrollY up" — backwards; the CODE is correct (positive dy scrolls down, `scrollY` increases, which the test asserts), only the comment is wrong.
- `background.ts persistTransitions` read-modify-write on `storage.session` is not serialized — two rapid transitions could interleave and drop a diagnostic entry; negligible (transitions are rare, diagnostic-only).
- `offscreen/gesture-frame.ts:14 POINTER_FILTER_OPTS` — reviewer confirmed these are 1€ pointer-smoothing cutoffs, NOT gesture-timing; does not cross the boundary. Logged as "considered, acceptable".

Milestone 1A execute phase COMPLETE: all six tasks done + reviewed clean (Task 6 with 1 parked), final whole-branch review clean, 8/8 exit checks PASS, lock OK. Next step (owner/driver, not the worker): PR + merge to master, then log roadmap §8 + remove STATUS row. Workspace retained (merge not yet done).


