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

