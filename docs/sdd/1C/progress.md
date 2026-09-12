# 1C execute — progress ledger

Task order (impl plan): 1 (protocol) → 2/3/4 (independent) → 5/6 → 7 → 8.

| Task | Component | State | Commit | Notes |
|---|---|---|---|---|
| 1 | protocol | **done** | `6019fa9` | `PageCommand`/`PageEvent`/`Intent` extended; new `A11yItem`, `CursorState`. Frozen 2A I1–I4 + 1C contracts pass. |
| 2 | gesture-core | **done** | `6db31d4` | Full `Armed.*` tree (Pointing/PinchDown/Dragging/SwipeArmed/Hold). Frozen 2A I5 (Victory hold) + 1C tree/replay contracts pass. E2 model tests pass. |
| 3 | page-index | todo | — | interactable index + id scheme |
| 4 | page-index | todo | — | snapping |
| 5 | content | todo | — | overlay + snapping wiring + synthetic fallback |
| 6 | background | todo | — | dispatcher, CDP-when-granted, pointer relay (ADR 0001) |
| 7 | background | todo | — | SW hardening |
| 8 | extension | todo | — | e2e (Fitts E1, SW-recovery E3) |

## Session 1 (execute, Tasks 1–2)

Done: Tasks 1 and 2 (the two owned per `.claude/scope.json`), TDD (failing unit/replay tests → implement → pass).

Decisions taken within CLAUDE.md §1 (not owner-level):
- **Timing via `FrameInput.ts` deltas, not XState `after()`.** The impl plan's design notes suggest `after` for dwell/inertia/hold, but the frozen `2A`/`1C` replay contracts call `replayFrames` on the default (real-time) clock synchronously, where `after` never fires. All 1C timing is therefore derived from frame timestamps inside the machine (the existing clutch pattern) — still single-owner, still no timers outside XState. Rule (`gesture-core.md`) satisfied.
- **Scripted-frame replays, no `fixtures/gestures/1c-*.json`.** `fixtures/**` is outside this session's write scope (`.claude/scope.json`); the impl plan's Step-1 examples and the frozen contracts already use inline scripted `FrameInput`, so the six replay tests + model test do the same. No landmark-fixture change was made (these are new post-classifier FSM thresholds, exercised by scripted frames).
- **`replay.ts` extended** (covered by `packages/gesture-core/**`) to subscribe to the new emitted intents; the frozen `replayFrames` contract requires them surfaced.

Verification: `pnpm vitest run` 203 pass; `pnpm -r build` clean; boundary-lint OK; `exit-check 1C --fast` → E2 + I1–I5 PASS (E1/E3 are Task 8).
