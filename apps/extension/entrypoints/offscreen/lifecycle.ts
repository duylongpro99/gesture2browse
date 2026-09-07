// Offscreen document lifecycle (Task 6): decides whether main.ts should
// re-acquire the camera and restart the worker when the transferred stream
// ends (worker's `streamEnded` message, or the video track's `ended` event).
// This is a restart-storm guard — NOT gesture timing (CLAUDE.md §2 /
// boundary-lint rule 4 forbid CLUTCH/COOLDOWN/HYSTERESIS/DWELL/DEBOUNCE
// identifiers outside gesture-core; a camera that keeps ending immediately
// must not spin-loop getUserMedia, which is a lifecycle concern, not a
// gesture-vote concern). Pure: no DOM, timers, or globals — main.ts supplies
// `now` and owns the mutable state between restarts.

export interface RestartState {
  /** Timestamps (ms) of past restarts, oldest first, pruned to the trailing window. */
  restartTimes: number[];
}

export interface RestartParams {
  /** Minimum gap required since the last restart before another is allowed. */
  minIntervalMs: number;
  /** Maximum restarts allowed within the trailing `windowMs`. */
  maxRestartsPerWindow: number;
  /** Trailing window (ms) over which `maxRestartsPerWindow` is counted. */
  windowMs: number;
}

export const DEFAULT_RESTART_PARAMS: RestartParams = {
  minIntervalMs: 500,
  maxRestartsPerWindow: 5,
  windowMs: 10000,
};

/**
 * Decide whether a restart is currently allowed: false if the last restart
 * was less than `minIntervalMs` ago, or if `maxRestartsPerWindow` restarts
 * already happened within the trailing `windowMs`; true otherwise.
 */
export function shouldRestart(
  state: RestartState,
  now: number,
  params: RestartParams = DEFAULT_RESTART_PARAMS,
): boolean {
  const last = state.restartTimes[state.restartTimes.length - 1];
  if (last !== undefined && now - last < params.minIntervalMs) return false;

  const windowStart = now - params.windowMs;
  const countInWindow = state.restartTimes.filter((t) => t > windowStart).length;
  return countInWindow < params.maxRestartsPerWindow;
}

/** Record a restart at `now`, pruning entries older than the trailing window (bounded memory). */
export function recordRestart(state: RestartState, now: number, params: RestartParams = DEFAULT_RESTART_PARAMS): void {
  state.restartTimes.push(now);
  const windowStart = now - params.windowMs;
  while (state.restartTimes.length > 0 && state.restartTimes[0] !== undefined && state.restartTimes[0] <= windowStart) {
    state.restartTimes.shift();
  }
}
