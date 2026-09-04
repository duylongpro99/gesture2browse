import { describe, it, expect } from 'vitest';
import { OneEuroFilter } from '@gesture/gesture-core';
describe('OneEuroFilter', () => {
  it('passes a constant signal through unchanged after warm-up', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 });
    let out = 0;
    for (let t = 0; t < 200; t += 33) out = f.filter(5, t);
    expect(out).toBeCloseTo(5, 1);
  });
  it('attenuates a single-sample spike', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 });
    f.filter(0, 0);
    const spike = f.filter(100, 33);
    expect(spike).toBeLessThan(100);
  });
});
