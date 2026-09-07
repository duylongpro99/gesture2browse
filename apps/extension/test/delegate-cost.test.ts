import { describe, it, expect } from 'vitest';
import {
  observeFrameCost,
  DEFAULT_DELEGATE_COST_STATE,
  DEFAULT_DELEGATE_COST_PARAMS,
  type DelegateCostState,
} from '../entrypoints/offscreen/delegate-cost';

// Finding 3: a cold/shader-compile warm-up spike must NOT pin WASM; only a
// sustained run of over-budget frames should. Pure reducer — feed a cost series.
const P = DEFAULT_DELEGATE_COST_PARAMS; // perFrameMs 40, warmup 2, sustained 3
const OVER = P.perFrameMs + 50;
const UNDER = P.perFrameMs - 20;

function feed(costs: number[]): { downgradedAt: number | null; state: DelegateCostState } {
  let state = { ...DEFAULT_DELEGATE_COST_STATE };
  let downgradedAt: number | null = null;
  costs.forEach((c, i) => {
    const r = observeFrameCost(state, c, P);
    state = r.state;
    if (r.downgrade && downgradedAt === null) downgradedAt = i;
  });
  return { downgradedAt, state };
}

describe('observeFrameCost (delegate warm-up + sustained cost)', () => {
  it('ignores the warm-up frames even when they are wildly over budget', () => {
    // Only the first `warmupFrames` samples, all over budget: no downgrade.
    const { downgradedAt } = feed(Array(P.warmupFrames).fill(OVER * 10));
    expect(downgradedAt).toBeNull();
  });

  it('does not downgrade on a single post-warm-up spike', () => {
    // warm-up, then one over-budget frame, then healthy frames.
    const { downgradedAt } = feed([OVER, OVER, OVER, UNDER, UNDER, UNDER]);
    expect(downgradedAt).toBeNull();
  });

  it('downgrades only after sustainedOverBudget consecutive over-budget frames past warm-up', () => {
    const series = [
      ...Array(P.warmupFrames).fill(OVER), // warm-up (ignored)
      ...Array(P.sustainedOverBudget).fill(OVER), // sustained -> trips on the last one
    ];
    const { downgradedAt } = feed(series);
    expect(downgradedAt).toBe(series.length - 1);
  });

  it('resets the consecutive run when a healthy frame interrupts it', () => {
    const series = [
      OVER, OVER, // warm-up
      OVER, OVER, // 2 over budget (one short of sustained)
      UNDER, // resets the run
      OVER, OVER, // 2 over budget again — still short of sustained
    ];
    expect(feed(series).downgradedAt).toBeNull();
  });
});
