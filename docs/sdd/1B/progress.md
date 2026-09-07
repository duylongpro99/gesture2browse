# SDD ledger — plan: docs/plans/1B.impl.md

Milestone 1B (perception pipeline). Plan: `docs/plans/1B.md` (five questions + Exit checks). Spec: `docs/plans/1B.spec.md` (binding authority). Impl: `docs/plans/1B.impl.md`. SDD workspace: `docs/sdd/1B/`.

Owner decisions 2026-09-07 (all option a, `docs/sdd/1B/driver.json`): browser-inference path only; offline-trained MLP behind the `Classifier` seam; frozen `GestureLabel` vocabulary + additive `GestureFrame.palmFacing`; proceed on the MOCK G4 with Exit E1 owner-deferred.

## Tasks (from 1B.impl.md — write scope per task derived from each `**Files:**` block)

| # | Component | Title | Status |
|---|---|---|---|
| 1 | protocol | additive `GestureFrame.palmFacing` | complete |
| 2 | gesture-core | pure MLP classifier, palm-facing helper, landmark filtering | complete |
| 3 | scripts | offline MLP training + shipped weights artifact | complete |
| 4 | gesture-core | FSM vote + palm-facing gate; golden replay suite (E2) | complete |
| 5 | offscreen | worker robustness + wire the trained classifier | not started |
| 6 | offscreen | lifecycle: restart on stream end | not started |
| 7 | extension | adaptive-fps + context-loss e2e (E3) | not started |

## Dependency order

1 (protocol field) → 2 (pure pieces) → 3 (training needs 2's `mlp.ts` forward + weights artifact) → 4 (FSM vote/gate + golden suite needs 2's `MlpClassifier` and 3's weights) → 5 (worker wires 2/3 + robustness) → 6 (restart, after 5's worker teardown semantics) → 7 (e2e, after 5/6). Sequential; run 1B.impl.md tasks in this order.

## Frozen contracts — must NOT be edited, must keep passing

- `packages/protocol/test/contracts/gestureframe-v0.contract.test.ts` — additive optional `palmFacing` only (non-strict `z.object`, still parses).
- `packages/gesture-core/test/contracts/1C-fsm-state-tree.contract.test.ts` — the 3-frame vote + palm-facing gate are backward-compatible (`palmFacing===false` blocks, `undefined` passes; scripted holds exceed 3 frames), so the frozen intent/state sequence is preserved.

## Session 0 (plan)

Produced `1B.spec.md`, `1B.impl.md`, `1B.md` (Exit checks E1–E3, no I-rows — the roadmap row has no "Interfaces fixed here"), and this ledger. Five-question checklist run on `1B.impl.md`. `exit-check 1B --fast` parses the 3-row table (E2/E3 FAIL only because this worktree has no `node_modules` and no code yet; commands mirror 1A's working form). Handoff DONE → execute session 1 starts at Task 1.

## Session 1 (execute) — SDD ledger

Preflight scan (Tasks 1–2, this session's scope): share no files; Task 2's pure helpers do not consume Task 1's `palmFacing` field. Clean, order 1→2. BASE `6c7bf20`.

- Task 1: complete (commits 6c7bf20..c94f481, review clean — spec ✅, quality approved; frozen `gestureframe-v0` contract untouched, 49/49 protocol tests pass).
- Task 2: complete (commits c94f481..a506c4b, review clean — spec ✅, quality Approved; 10 files/29 tests pass incl. frozen `1C-fsm-state-tree` contract; typecheck clean).
  - Minor (deferred → final review): `mlp.ts` `forward()` on empty `layers` runs `softmax(input)` directly (harmless; brief guarantees layers, not exercised). `landmark-filter.ts` `DEFAULT_PARAMS` shared object as default param (harmless; only primitives read).
  - ⚠️ Ruling: `palmFacing` z-sign convention is a documented, internally-consistent judgment call with no prior codebase precedent — NOT a Task-2 gap (brief only requires toward/away fixtures). Cost if wrong: a one-line comparison flip when Task 5 wires it to the live MediaPipe z-axis; no callers depend on the internal sign. Carry to Task 5 dispatch.
  - ⚠️ Ruling: landmark-filter `dCutoff: 1.0` default is unspecified in tech-stack §64's table; implementer matched the existing `one-euro.test.ts` fixture. It is a fixture-tunable, not a plan constant — Task 4's jitter-lag/golden replay is where it gets retuned/locked. Not a Task-2 gap. Carry to Task 4 dispatch.

Session 1 stopped at the 2-task cap (Tasks 1–2). exit-check 1B --fast @ a506c4b: E1 OWNER (deferred), E2 FAIL (replay-golden.test.ts is Task 4, not built), E3 FAIL (adaptive-fps.e2e.ts is Task 7, not built); lock OK (frozen at 6c7bf20). Next session: Task 3.

## Session 2 (execute) — SDD ledger

Preflight (Tasks 3–4, this session's scope): Task 3 (`scripts/train` + artifact + wxt hook + weights test) shares no files with Task 4 (`gesture-core` FSM/replay/constants + golden/vote/jitter tests); Task 4 consumes Task 3's shipped `gesture-mlp.json` at runtime only (the golden suite loads it). Order 3→4. BASE `f23e391`.

- Task 3: complete. `scripts/train/train-gesture-mlp.ts` (seeded/deterministic SGD MLP, forward via gesture-core, held-out by `subjectId`, prints per-gesture P/R + false-fires/10min with N-frame voting); shipped `fixtures/models/gesture-mlp.json` (8-class, 63→16→8, `featureVersion=wrist-centered-63/v1`); `wxt.config.ts` copies it to `/models`; `fixtures/README.md` documents it; `mlp-weights.test.ts` (loads into MlpClassifier, labels == GestureLabel.options). Review clean — 3 nits (all diagnostic-only on the owner-deferred E1 table: VOTE_N literal mirrors VOTE_FRAMES; false-fires assumes 30 fps; majorityVote windows cross concatenated-fixture boundaries). Documented inline; not fixed (mock data, E1 deferred). The one TS error the review flagged (machine.ts:99) was the Task-4 trackVote bug, fixed before Task 4 tests ran.
- Task 4: complete. `machine.ts`: `FrameInput.palmFacing?`; 3-frame confidence vote (`voteGesture`/`voteFrames` in context, `trackVote` on every FRAME transition; guards see the count incl. the current frame) gates arm+scroll; palm-facing gate blocks on explicit `palmFacing===false`, `undefined`/`true` pass. `constants.ts`: `VOTE_FRAMES = 3`. `replay.ts`: `replayFixtureWith(record, classifier)`; `replayFixture` delegates with `KnnClassifier`. Golden suite `replay-golden.test.ts` (E2): per-frame label + intent snapshot + weights sha256 lock + threshold lock. New `vote-gate.test.ts`, `jitter-lag.test.ts`. Clutch TIMING preserved (clutchStart at first raw palm frame); frozen `1C-fsm-state-tree` + `gestureframe-v0` contracts untouched and pass.
  - Non-frozen consumer/unit tests updated for the vote (their 2-palm-frame / 1-fist-frame shortcuts no longer arm/scroll): `machine.test.ts`, `replay-scroll.test.ts`, and `apps/extension/test/fsm-wiring.test.ts` (apps/extension is in scope `allow`). Behaviour change, not a spec gap — spec §5 says both the palm and fist holds exceed 3 frames, i.e. the vote applies to both arm and scroll.
  - Task 4 review (subagent): clean — vote counting correct (trackVote on every FRAME transition incl. the `fistReleased`→Idle branch; XState v5 bubbling to the Armed parent default keeps the run count in sync; guard+assign read the same pre-transition context, no off-by-one), palm-facing gate correct on arm/pause/scroll, both frozen contracts byte-unedited (`git diff HEAD~1` empty) and green, weights sha256 matches the golden lock, no new dep. Two nits accepted (degenerate `[]` intent golden — E1 owner-deferred; mid-scroll lingering in `Armed.Scrolling` substate — cosmetic, matches pre-vote design).
  - ⚠️ Carry to Task 5 (from the Task-4 review — actionable): `apps/extension/entrypoints/background/fsm.ts` `toFrameInput()` maps only `ts/present/gesture/score/velocity` — it does **not** forward `palmFacing`. Until Task 5 adds `palmFacing: frame.palmFacing` there (and asserts it in `fsm-wiring.test.ts`), the palm-facing gate receives `undefined` and stays permanently ungated in production even though the offscreen side sets `GestureFrame.palmFacing`. Task 5's impl-plan file list does not mention `toFrameInput`, so this can slip. NOT fixed here (unassigned to Tasks 3–4; premature before the offscreen side populates the field).
  - ⚠️ Carry to Task 5: `palmFacing` z-sign convention (from session 1) — the FSM now consumes `GestureFrame.palmFacing`; Task 5 wires the offscreen `palmFacing()` output to it and must confirm the sign against live MediaPipe z.
  - Landmark-filter `dCutoff: 1.0` (session-1 carry): exercised by `jitter-lag.test.ts` on the replayed fixture; retune when real fixtures land.

Session 2 stopped at the 2-task cap (Tasks 3–4). exit-check 1B --fast: E1 OWNER (deferred), **E2 PASS** (golden suite built + green), E3 FAIL (adaptive-fps.e2e.ts is Task 7, not built); lock OK. Next session: Task 5.
