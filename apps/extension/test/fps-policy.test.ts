import { describe, it, expect } from 'vitest';
import { shouldInfer, DEFAULT_FPS_POLICY_PARAMS, type FpsPolicyState } from '../entrypoints/offscreen/fps-policy';

// Unit tests for the offscreen fps-throttle decision (Task 5): a pure
// function over an explicit state snapshot, no DOM/timers. The worker still
// reads+closes every camera frame; this only decides whether to run
// inference on a given read (CPU-budget policy, not gesture timing —
// CLAUDE.md §2 keeps gesture-timing constants in gesture-core only).

const { idleWindowMs, activeFrameMs, idleFrameMs } = DEFAULT_FPS_POLICY_PARAMS;

describe('shouldInfer', () => {
  it('infers on the very first tick (lastInferTs is null)', () => {
    const state: FpsPolicyState = { lastHandSeenTs: null, lastInferTs: null };
    expect(shouldInfer(state, 0)).toBe(true);
  });

  it('gates the active rate: no re-infer before ~1000/30ms has elapsed', () => {
    const state: FpsPolicyState = { lastHandSeenTs: 0, lastInferTs: 0 };
    expect(shouldInfer(state, 10)).toBe(false); // well under the ~33.3ms active frame time
    expect(shouldInfer(state, activeFrameMs)).toBe(true);
  });

  it('allows an exact-boundary tick (now - lastInferTs === targetInterval)', () => {
    const state: FpsPolicyState = { lastHandSeenTs: 0, lastInferTs: 0 };
    expect(shouldInfer(state, activeFrameMs)).toBe(true);
  });

  it('downshifts to the idle rate once idleWindowMs has passed with no hand seen', () => {
    expect(idleFrameMs).toBeGreaterThan(activeFrameMs);

    // Just before the idle window closes (now - lastHandSeenTs < idleWindowMs):
    // still the active rate, so a tick one active-frame after the last
    // inference is due.
    const justBeforeIdle: FpsPolicyState = { lastHandSeenTs: 0, lastInferTs: idleWindowMs - activeFrameMs - 1 };
    expect(shouldInfer(justBeforeIdle, idleWindowMs - 1)).toBe(true);

    // Once idleWindowMs has elapsed since the last hand sighting, the target
    // interval widens to idleFrameMs: a tick that would satisfy the active
    // rate but not the idle rate must be rejected until the wider interval elapses.
    const justAfterIdle: FpsPolicyState = { lastHandSeenTs: 0, lastInferTs: idleWindowMs + 1 };
    expect(shouldInfer(justAfterIdle, idleWindowMs + 1 + activeFrameMs)).toBe(false);
    expect(shouldInfer(justAfterIdle, idleWindowMs + 1 + idleFrameMs)).toBe(true);
  });

  it('resumes the active rate as soon as a hand is detected again', () => {
    // lastHandSeenTs reset by the caller on hand detection -> idle is false again.
    const state: FpsPolicyState = { lastHandSeenTs: 9000, lastInferTs: 9000 };
    expect(shouldInfer(state, 9000 + activeFrameMs)).toBe(true);
    expect(shouldInfer(state, 9000 + 1)).toBe(false);
  });

  it('treats an exact idleWindowMs gap as still active (idle requires strictly greater than the window)', () => {
    const state: FpsPolicyState = { lastHandSeenTs: 0, lastInferTs: idleWindowMs - activeFrameMs };
    expect(shouldInfer(state, idleWindowMs)).toBe(true);
  });
});
