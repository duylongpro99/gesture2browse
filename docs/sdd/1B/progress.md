# SDD ledger — plan: docs/plans/1B.impl.md

Milestone 1B (perception pipeline). Plan: `docs/plans/1B-perception.md` (five questions + Exit checks). Spec: `docs/plans/1B.spec.md` (binding authority). Impl: `docs/plans/1B.impl.md`. SDD workspace: `docs/sdd/1B/`.

Owner decisions 2026-09-07 (all option a, `docs/sdd/1B/driver.json`): browser-inference path only; offline-trained MLP behind the `Classifier` seam; frozen `GestureLabel` vocabulary + additive `GestureFrame.palmFacing`; proceed on the MOCK G4 with Exit E1 owner-deferred.

## Tasks (from 1B.impl.md — write scope per task derived from each `**Files:**` block)

| # | Component | Title | Status |
|---|---|---|---|
| 1 | protocol | additive `GestureFrame.palmFacing` | not started |
| 2 | gesture-core | pure MLP classifier, palm-facing helper, landmark filtering | not started |
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

Produced `1B.spec.md`, `1B.impl.md`, `1B-perception.md` (Exit checks E1–E3, no I-rows — the roadmap row has no "Interfaces fixed here"), and this ledger. Five-question checklist run on `1B.impl.md`. `exit-check 1B --fast` parses the 3-row table (E2/E3 FAIL only because this worktree has no `node_modules` and no code yet; commands mirror 1A's working form). Handoff DONE → execute session 1 starts at Task 1.
