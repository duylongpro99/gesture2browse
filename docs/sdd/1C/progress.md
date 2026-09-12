# 1C execute — progress ledger

Task order (impl plan): 1 (protocol) → 2/3/4 (independent) → 5/6 → 7 → 8.

| Task | Component | Commit | State | Notes |
|---|---|---|---|---|
| 1 | protocol | `6019fa9` | **done** | `PageCommand`/`PageEvent`/`Intent` extended; new `A11yItem`, `CursorState`. Frozen 2A I1–I4 + 1C contracts pass. |
| 2 | gesture-core | `6db31d4` | **done** | Full `Armed.*` tree (Pointing/PinchDown/Dragging/SwipeArmed/Hold). Frozen 2A I5 (Victory hold) + 1C tree/replay contracts pass. E2 model tests pass. |
| 3 | page-index | `79bb32d` | **done** | interactable index + WeakMap-stable id scheme, `SpatialGrid`, selectors/visibility, `at(x,y,radius?)`. 9 happy-dom tests. |
| 4 | page-index | `8b91fed` | **done** | snapping: speed-scaled radius, neighbour hysteresis (no-flicker property test), pinch latch. Constant `SNAP_HYSTERESIS_PX`→`SNAP_NEIGHBOUR_MARGIN_PX` (boundary-lint rule 4). |
| 5 | content | — | todo | overlay + snapping wiring + synthetic fallback |
| 6 | background | — | todo | dispatcher, CDP-when-granted, pointer relay (ADR 0001) |
| 7 | background | — | todo | SW hardening |
| 8 | extension | — | todo | e2e (Fitts E1, SW-recovery E3) |

## Session 1 (execute, Tasks 1–2)

Done: Tasks 1 and 2 (the two owned per `.claude/scope.json`), TDD (failing unit/replay tests → implement → pass).

Decisions taken within CLAUDE.md §1 (not owner-level):
- **Timing via `FrameInput.ts` deltas, not XState `after()`.** The impl plan's design notes suggest `after` for dwell/inertia/hold, but the frozen `2A`/`1C` replay contracts call `replayFrames` on the default (real-time) clock synchronously, where `after` never fires. All 1C timing is therefore derived from frame timestamps inside the machine (the existing clutch pattern) — still single-owner, still no timers outside XState. Rule (`gesture-core.md`) satisfied.
- **Scripted-frame replays, no `fixtures/gestures/1c-*.json`.** `fixtures/**` is outside this session's write scope (`.claude/scope.json`); the impl plan's Step-1 examples and the frozen contracts already use inline scripted `FrameInput`, so the six replay tests + model test do the same. No landmark-fixture change was made (these are new post-classifier FSM thresholds, exercised by scripted frames).
- **`replay.ts` extended** (covered by `packages/gesture-core/**`) to subscribe to the new emitted intents; the frozen `replayFrames` contract requires them surfaced.

Verification: `pnpm vitest run` 203 pass; `pnpm -r build` clean; boundary-lint OK; `exit-check 1C --fast` → E2 + I1–I5 PASS (E1/E3 are Task 8).

## Session 2 (execute, Tasks 3–4)

Done: Tasks 3 and 4 (the two owned per `.claude/scope.json`), TDD (failing tests → build → pass).

Decision taken within CLAUDE.md §1 (not owner-level):
- **`SNAP_HYSTERESIS_PX` → `SNAP_NEIGHBOUR_MARGIN_PX`.** The impl plan named the tunable `SNAP_HYSTERESIS_PX`, but `scripts/lint/boundary-lint.mjs` rule 4 rejects any `const` whose name contains `HYSTERESIS` outside gesture-core (guarding the single gesture-*timing* owner). Snapping's neighbour margin is a *spatial px* value, which roadmap §4.3 explicitly assigns to page-index — the rule's intent (no gesture timing in page-index) is intact. Renamed the export + option (`neighbourMarginPx`); scope forbids editing the lint (`scripts/` not in `allow`). Task 5 (content) must import the new name.

Note (id-scheme design): `InteractableIndex.at` gained an optional third `radius` arg (default 0 = point-contains) so the snapper can broad-phase within a radius over the same id scheme; additive, no downstream break.

Verification: `pnpm vitest run packages/page-index` 15 pass; `pnpm --filter @gesture/page-index build` clean; typecheck + biome lint clean (0 warnings); boundary-lint OK; `exit-check 1C --fast` → E2 + I1–I5 PASS (E1/E3 remain Task 8).
