// Adaptive inference-rate policy for the G1 worker read loop (Task 5). The
// worker reads (and closes) every camera frame at ~30fps regardless — this
// module only decides whether to spend a `detectForVideo` call on a given
// read, downshifting to a lower inference rate after a window with no hand
// seen and resuming full rate the instant a hand is detected again.
//
// This is a CPU-budget policy (how often we run inference), NOT gesture
// timing (hold/cooldown/hysteresis/confidence-vote windows) — those live
// solely in gesture-core's state machine (CLAUDE.md §2). Pure: no DOM,
// timers, or globals — the worker supplies `now` from `performance.now()`
// and owns the mutable state snapshot between ticks.

export interface FpsPolicyState {
  /** ts of the most recent frame in which a hand was present, or null before any hand has been seen. */
  lastHandSeenTs: number | null;
  /** ts of the most recent inference run, or null before the first tick. */
  lastInferTs: number | null;
}

export interface FpsPolicyParams {
  /** No-hand duration after which the inference rate downshifts. */
  idleWindowMs: number;
  /** Target ms between inferences while a hand has been seen recently. */
  activeFrameMs: number;
  /** Target ms between inferences once idle (no hand for > idleWindowMs). */
  idleFrameMs: number;
}

export const DEFAULT_FPS_POLICY_PARAMS: FpsPolicyParams = {
  idleWindowMs: 5000,
  activeFrameMs: 1000 / 30,
  idleFrameMs: 1000 / 15,
};

// Guards against floating-point ms arithmetic missing an exact-boundary tick
// (e.g. `now - lastInferTs` landing at 33.299999999999997 instead of
// 33.333...). Small relative to either frame interval.
const EPSILON_MS = 0.5;

/**
 * Decide whether the worker should run inference on this read. `idle` is
 * true once more than `idleWindowMs` has elapsed since a hand was last seen
 * (a state with `lastHandSeenTs: null` — no hand ever seen — is idle from
 * the caller's perspective once the caller has seeded it appropriately; the
 * worker seeds `lastHandSeenTs` with the first frame's ts at pump start, so
 * this module never has to special-case "never seen").
 */
export function shouldInfer(
  state: FpsPolicyState,
  now: number,
  params: FpsPolicyParams = DEFAULT_FPS_POLICY_PARAMS,
): boolean {
  const idle = state.lastHandSeenTs !== null && now - state.lastHandSeenTs > params.idleWindowMs;
  const targetIntervalMs = idle ? params.idleFrameMs : params.activeFrameMs;
  return state.lastInferTs === null || now - state.lastInferTs >= targetIntervalMs - EPSILON_MS;
}
