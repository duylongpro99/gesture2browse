# SDD ledger — plan: docs/plans/1B.impl.md

Milestone 1B (perception pipeline). Plan: `docs/plans/1B.md` (five questions + Exit checks). Spec: `docs/plans/1B.spec.md` (binding authority). Impl: `docs/plans/1B.impl.md`. SDD workspace: `docs/sdd/1B/`.

Owner decisions 2026-09-07 (all option a, `docs/sdd/1B/driver.json`): browser-inference path only; offline-trained MLP behind the `Classifier` seam; frozen `GestureLabel` vocabulary + additive `GestureFrame.palmFacing`; proceed on the MOCK G4 with Exit E1 owner-deferred.

## Tasks (from 1B.impl.md — write scope per task derived from each `**Files:**` block)

| # | Component | Title | Status |
|---|---|---|---|
| 1 | protocol | additive `GestureFrame.palmFacing` | complete |
| 2 | gesture-core | pure MLP classifier, palm-facing helper, landmark filtering | complete |
| 3 | scripts | offline MLP training + shipped weights artifact | not started |
| 4 | gesture-core | FSM vote + palm-facing gate; golden replay suite (E2) | not started |
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
