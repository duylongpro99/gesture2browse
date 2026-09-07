# 1B — Perception pipeline — plan

Roadmap §4.2. Owner decisions 2026-09-07 (all option a, `docs/sdd/1B/driver.json`). Spec: [`1B.spec.md`](./1B.spec.md). Implementation: [`1B.impl.md`](./1B.impl.md).

Scope (owner Q1): the **browser-inference path only**. The ONNX-Web fallback is out of scope — a roadmap §9 re-plan trigger ("Intel Air < 20 fps on every path"); the final G8 GO/NO-GO is owner sign-off deferred until G3 lands; "delegate order" is a bench/fixture tunable, not plan material.

## The five questions (CLAUDE.md §1)

### 1. Placement
Two owning components, joined by one `protocol` message:
- **`apps/extension/entrypoints/offscreen`** — worker lifecycle, timed delegate selection + `webglcontextlost` recovery, adaptive 30/15 fps, restart-on-stream-end, and the per-frame composition that writes `GestureFrame` (trained label/score, extended 1€ landmark filtering, `palmFacing`).
- **`packages/gesture-core`** — the pure `MlpClassifier` (behind the existing `Classifier` seam; `KnnClassifier` retained as the conformance fallback), the pure `palmFacing` and `createLandmarkFilter` helpers, and — because the FSM is the single owner of gesture timing (CLAUDE.md §2) — the 3-frame vote and palm-facing gate in the XState machine.
- **Joining message:** `GestureFrame` in `packages/protocol` (extended additively, Q3). Offline training lives in `scripts/train/`.

Boundary tension resolved: arch §3.1 places "3-frame vote, palm-facing gate" in the offscreen classifier, but CLAUDE.md §2 / `.claude/rules/offscreen.md` forbid gesture-timing logic there and name the FSM as the single owner. **CLAUDE.md wins** — the per-frame palm-facing *boolean* is a geometric feature (offscreen, no timing) on `GestureFrame`; the *vote* and the *firing gate* live in the FSM (noted in `## Status`).

### 2. Boundary check
- `gesture-core` (MLP, palm-facing, landmark filter, FSM vote/gate) stays pure TS + `xstate` + `zod` + `@gesture/protocol` types; no DOM/`chrome.*`/`fetch`/timers. ✓ `.claude/rules/gesture-core.md`
- `offscreen` uses `@mediapipe/tasks-vision`, `gesture-core`, `protocol`, the runtime Port; no network/`chrome.storage`; video/`VideoFrame`/landmarks stay in the worker (weights are numeric, `palmFacing` a boolean). ✓ `.claude/rules/offscreen.md`, boundary-lint rule 1
- `protocol` change (`palmFacing`) depends on `zod` only. ✓ `.claude/rules/protocol.md`
- Training script is camera-free and under `scripts/`; **no new runtime dependency** (pure-TS MLP). ✓ CLAUDE.md §2, §4
- No rule file needs to change → none is edited in this PR (CLAUDE.md §5).

### 3. Interfaces touched
`GestureFrame` gains **one optional additive field**, `palmFacing?: boolean` (Zod schema in `packages/protocol` first, then offscreen writes it and the FSM/diagnostics read it). Additive — the frozen `gestureframe-v0` contract (non-strict `z.object`) still parses and 1A's "extend, none redefines" holds. `gesture-core`'s internal `FrameInput` gains an optional `palmFacing?: boolean`. No new `GestureLabel` members: the classifier's vocabulary **is** the frozen enum; the mock role-names are FSM/Intent mappings (Q3). No "Interfaces fixed here" in the roadmap row → no frozen interface, no contract (I) test.

### 4. Principle check (arch §1)
- **Two loops, two speeds** — inference stays worker-side; only the numeric `GestureFrame` crosses; adaptive fps protects the fast loop's CPU budget.
- **Video stays in one process** — landmarks/`VideoFrame` never leave the worker.
- **Page is hostile** — unchanged; the SW still Zod-validates every `GestureFrame` before the FSM.
- **Agent proposes, human disposes** — untouched.
- **Replaceable parts** — the `Classifier` interface is the seam; `MlpClassifier` swaps in, `KnnClassifier` stays as fallback; a later ONNX-Web path can replace worker inference behind the same `GestureFrame` output.

### 5. Tests
Fixture replay is the regression suite (`.claude/rules/gesture-core.md`). Golden replay suite fails loudly on threshold/weights change (E2); the training script prints the held-out precision/recall + false-fires/10 min table (E1, owner-deferred on mock); Playwright asserts 30/15 fps adaptation and `WEBGL_lose_context` recovery (E3). Unit tests cover MLP forward, palm-facing, landmark filter, FSM vote/gate (incl. backward-compat), fps-policy, and lifecycle restart.

## Exit checks

| # | Criterion (verbatim) | Kind | Check |
|---|---|---|---|
| E1 | Precision/recall table on held-out fixtures meets the G4 target | owner | - |
| E2 | replay suite in CI fails loudly on threshold change | mechanical | `pnpm vitest run packages/gesture-core/test/replay-golden.test.ts` |
| E3 | 30/15 fps adaptation verified in Playwright | mechanical | `pnpm exec playwright test -c apps/extension/playwright.config.ts adaptive-fps.e2e.ts` |

E1 is owner-verified/deferred (owner Q3): G4 is the MOCK row with no real fixtures or precision/recall targets, so "meets the G4 target (≥ 95 %)" cannot pass mechanically. The training script and its table are still built and run; E1 becomes a one-line owner confirmation once real recordings land. No `I` rows — the roadmap row has no "Interfaces fixed here" cell.

## Status

_Owned by the 1B session; rewritten, not appended._

**Done (session 0, plan):**
- Brainstorm (architectural) → three owner questions batched; answered 2026-09-07, all option (a) (`docs/sdd/1B/driver.json`).
- Spec (`1B.spec.md`), implementation plan (`1B.impl.md`), this plan, and the Exit checks table (E1–E3; no I-rows) written. Five-question checklist run on `1B.impl.md`.
- SDD workspace generated under `docs/sdd/1B/`.

**Decisions applied from the owner answers:**
- Scope = browser-inference path only; ONNX-Web = roadmap §9 trigger; final G8 = owner sign-off deferred to G3; delegate order = tunable (Q1).
- Classifier = offline-trained small MLP (weights JSON shipped, loaded in the worker) behind the `Classifier` seam, `KnnClassifier` fallback; in-browser retraining deferred to Phase 3 (Q2).
- Classifier vocabulary = the frozen `GestureLabel` enum; mock role-names are FSM/Intent mappings, no new protocol labels; proceed on MOCK G4 with E1 owner-deferred (Q3).

**Conflicts noted (CLAUDE.md §6):** arch §3.1 lists the 3-frame vote + palm-facing gate under the offscreen classifier; CLAUDE.md §2 requires all gesture timing/gating in the FSM. Resolved in favour of CLAUDE.md §2 — palm-facing *boolean* offscreen (per-frame geometry), *vote + gate* in the FSM. The gate is backward-compatible (`palmFacing===false` blocks, `undefined` passes) so the frozen `1C-fsm-state-tree` contract is preserved.

**In progress:** none.

**Next (execute):** implement `1B.impl.md` Tasks 1–7 in order (protocol field → pure classifier/helpers → training + weights → FSM vote/gate + golden suite → worker robustness + wiring → restart-on-stream-end → adaptive-fps e2e). Threshold/weights changes replay the fixture suite.

**Blockers:** none for planning. Milestone-level: real G4 fixtures (E1) and the G3 bench (final G8 sign-off) remain owner/external and are out of 1B's build scope by decision.

**Proposed decision(s) for roadmap §8 (owner logs; agent does not edit §8):**

> | 2026-09-07 | **1B perception = browser-inference path only.** Small offline-trained MLP classifier (weights JSON shipped, loaded in the offscreen worker) behind the `Classifier` seam (`KnnClassifier` fallback); classifier vocabulary = the frozen `GestureLabel` enum (no new labels); `GestureFrame` extended additively with `palmFacing?:boolean`; 3-frame vote + palm-facing gate in the FSM (single timing owner, CLAUDE.md §2), backward-compatible with the frozen contracts. ONNX-Web fallback out of scope (roadmap §9 trigger: Intel Air < 20 fps on every path); final G8 GO/NO-GO deferred to owner sign-off once G3 lands; delegate order is a bench tunable. In-browser retraining deferred to Phase 3 (track 3.1). NOTE: planned/executed against the **MOCK** G4 row to test-drive the flow — Exit E1 (precision/recall ≥ 95 %) is owner-deferred until real fixtures land. | 1A merged; G4 (MOCK); owner answers 2026-09-07 (spec §1–§5) | Fixed in `docs/plans/1B-perception.md`; extends `GestureFrame`; consumed by 1C/1D/1E/2A |
