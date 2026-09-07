// Pure delegate cost-decision reducer (no MediaPipe/DOM imports so it is unit
// testable). The worker feeds each measured `detectForVideo` cost through
// `observeFrameCost`; the WebGL (GPU) delegate is downgraded to WASM only on a
// *sustained* over-budget signal, never on a single sample.
//
// Finding 3 (session-5 review): the first `detectForVideo` on a healthy GPU
// includes shader compile and commonly exceeds the per-frame budget, so the old
// "downgrade on the first over-budget frame" logic pinned WASM for the worker's
// whole life even when WebGL was fine — so a later context-loss recreate
// silently ran on CPU. We ignore the first `warmupFrames` samples and require
// `sustainedOverBudget` consecutive over-budget frames before downgrading.

export interface DelegateCostParams {
  /** Per-frame budget in ms; a webgl frame slower than this is "over budget". */
  perFrameMs: number;
  /** Warm-up samples ignored entirely (shader compile / cold GPU). */
  warmupFrames: number;
  /** Consecutive over-budget frames (after warm-up) required to downgrade. */
  sustainedOverBudget: number;
}

export interface DelegateCostState {
  /** WebGL frames observed so far (used to skip the warm-up window). */
  samples: number;
  /** Current run of consecutive over-budget frames (post warm-up). */
  consecutiveOverBudget: number;
}

export const DEFAULT_DELEGATE_COST_STATE: DelegateCostState = {
  samples: 0,
  consecutiveOverBudget: 0,
};

// Cost budgets for the delegate decision (arch §3.1 defaults). `initMs` gates
// the create-time choice (see mediapipe.ts); `perFrameMs`, `warmupFrames`, and
// `sustainedOverBudget` gate the per-frame downgrade here.
export const DEFAULT_DELEGATE_COST_PARAMS: DelegateCostParams = {
  perFrameMs: 40,
  warmupFrames: 2,
  sustainedOverBudget: 3,
};

/**
 * Fold one measured WebGL per-frame cost into the running state. Returns the
 * next state and whether this sample tips the decision to downgrade to WASM.
 * Pure: the same (state, elapsedMs, params) always yields the same result.
 */
export function observeFrameCost(
  state: DelegateCostState,
  elapsedMs: number,
  params: DelegateCostParams = DEFAULT_DELEGATE_COST_PARAMS,
): { downgrade: boolean; state: DelegateCostState } {
  const samples = state.samples + 1;
  // Still in the warm-up window: count the sample, ignore its cost.
  if (samples <= params.warmupFrames) {
    return { downgrade: false, state: { samples, consecutiveOverBudget: 0 } };
  }
  const overBudget = elapsedMs > params.perFrameMs;
  const consecutiveOverBudget = overBudget ? state.consecutiveOverBudget + 1 : 0;
  const downgrade = consecutiveOverBudget >= params.sustainedOverBudget;
  return { downgrade, state: { samples, consecutiveOverBudget } };
}
