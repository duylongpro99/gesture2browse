import { describe, it, expect } from 'vitest';
import { StageTimer, medianStages } from '../entrypoints/offscreen/stage-timer';

const marks = (n: number) => ({
  captureMs: n,
  inferMs: n * 10,
  normalizeMs: n / 10,
  classifyMs: n,
  filterMs: n / 100,
});

describe('medianStages', () => {
  it('takes the per-stage median independently', () => {
    const m = medianStages([marks(1), marks(3), marks(2)]);
    expect(m).toEqual(marks(2)); // median of {1,2,3} per stage
  });

  it('averages the two middle values for an even count', () => {
    const m = medianStages([marks(2), marks(4)]);
    expect(m.captureMs).toBe(3);
    expect(m.inferMs).toBe(30);
  });
});

describe('StageTimer', () => {
  it('reports the median per stage over the trailing window', () => {
    const t = new StageTimer(1000);
    t.record(100, marks(1));
    t.record(200, marks(3));
    t.record(300, marks(2));
    const s = t.sample(300);
    expect(s.stages).toEqual(marks(2));
    expect(s.dropped).toBe(0);
  });

  it('prunes marks that have fallen out of the trailing window', () => {
    const t = new StageTimer(1000);
    t.record(100, marks(9)); // falls out at now=1200 (100 <= 200)
    t.record(1150, marks(4));
    const s = t.sample(1200);
    expect(s.stages).toEqual(marks(4));
  });

  it('counts dropped frames and resets the count each sample', () => {
    const t = new StageTimer(1000);
    t.drop();
    t.drop();
    t.record(100, marks(1));
    const first = t.sample(100);
    expect(first.dropped).toBe(2);
    const second = t.sample(200);
    expect(second.dropped).toBe(0); // reset after the previous sample
  });

  it('returns undefined stages when no marks are in the window', () => {
    const t = new StageTimer(1000);
    t.drop();
    const s = t.sample(5000);
    expect(s.stages).toBeUndefined();
    expect(s.dropped).toBe(1);
  });
});
