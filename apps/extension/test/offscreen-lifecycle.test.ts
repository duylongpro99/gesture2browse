import { describe, it, expect } from 'vitest';
import {
  shouldRestart,
  recordRestart,
  DEFAULT_RESTART_PARAMS,
  type RestartState,
} from '../entrypoints/offscreen/lifecycle';

// Unit tests for the offscreen restart-decision helper (Task 6): pure
// decision + state mutator over an explicit snapshot, no DOM/timers. This
// guards against a camera stream that keeps ending immediately spin-looping
// getUserMedia calls — it is a lifecycle restart guard, not gesture timing
// (CLAUDE.md §2 / boundary-lint rule 4 keep hold/cooldown/hysteresis/
// dwell/debounce constants in gesture-core only).

const { minIntervalMs, maxRestartsPerWindow, windowMs } = DEFAULT_RESTART_PARAMS;

describe('shouldRestart', () => {
  it('restarts on the first stream end (no prior restarts)', () => {
    const state: RestartState = { restartTimes: [] };
    expect(shouldRestart(state, 0)).toBe(true);
  });

  it('refuses a second restart within minIntervalMs of the last one (guards a tight loop)', () => {
    const state: RestartState = { restartTimes: [] };
    recordRestart(state, 0);
    expect(shouldRestart(state, minIntervalMs - 1)).toBe(false);
    expect(shouldRestart(state, minIntervalMs)).toBe(true);
  });

  it('refuses further restarts once maxRestartsPerWindow have happened within windowMs', () => {
    const state: RestartState = { restartTimes: [] };
    let now = 0;
    for (let i = 0; i < maxRestartsPerWindow; i++) {
      expect(shouldRestart(state, now)).toBe(true);
      recordRestart(state, now);
      now += minIntervalMs; // space them out so only the count guard is exercised
    }
    // The window budget is now exhausted; even though minIntervalMs has
    // elapsed since the last restart, the count guard refuses.
    expect(shouldRestart(state, now)).toBe(false);
  });

  it('allows a restart again once the window has passed for the oldest entries', () => {
    const state: RestartState = { restartTimes: [] };
    let now = 0;
    for (let i = 0; i < maxRestartsPerWindow; i++) {
      recordRestart(state, now);
      now += minIntervalMs;
    }
    expect(shouldRestart(state, now)).toBe(false);

    // Advance past the window from the first recorded restart (t=0) so it
    // is pruned from the trailing count.
    const afterWindow = windowMs + 1;
    expect(shouldRestart(state, afterWindow)).toBe(true);
  });

  it('prunes entries older than windowMs so memory stays bounded', () => {
    const state: RestartState = { restartTimes: [] };
    recordRestart(state, 0);
    recordRestart(state, windowMs + minIntervalMs);
    // The t=0 entry is older than windowMs relative to the second restart's
    // time, so recordRestart should have pruned it, leaving just one entry.
    expect(state.restartTimes.length).toBe(1);
  });
});
