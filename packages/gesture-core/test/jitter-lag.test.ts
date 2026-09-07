import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FixtureRecordSchema } from '@gesture/protocol';
import { createLandmarkFilter } from '@gesture/gesture-core';

// Extended 1€ filtering (landmarks 0,4,8,9) reduces per-frame landmark jitter
// within a lag bound, measured on a replayed fixture (arch §3.1 / spec §7).
const fixturePath = fileURLToPath(
  new URL('../../../fixtures/gestures/placeholder.json', import.meta.url),
);

// Deterministic zero-mean pseudo-noise so the test is reproducible.
function noise(i: number): number {
  return Math.sin(i * 12.9898) * 0.5 * 0.02; // ±0.01 units, comparable to a landmark coord
}

// Total path length = sum of |consecutive deltas|; a proxy for jitter energy.
function pathLength(xs: number[]): number {
  let sum = 0;
  for (let i = 1; i < xs.length; i++) sum += Math.abs((xs[i] ?? 0) - (xs[i - 1] ?? 0));
  return sum;
}

describe('landmark filter jitter/lag on a replayed fixture', () => {
  const rec = FixtureRecordSchema.parse(JSON.parse(readFileSync(fixturePath, 'utf8')));
  const frames = rec.frames.filter((f) => f.present && f.landmarks !== undefined);

  // Point 8 (index-tip), x-coordinate — one of the filtered points.
  const POINT = 8;
  const COORD = POINT * 3;

  it('reduces jitter (shorter path length) than the noisy raw signal', () => {
    const filter = createLandmarkFilter();
    const clean: number[] = [];
    const noisy: number[] = [];
    const filtered: number[] = [];
    frames.forEach((f, i) => {
      const lm = (f.landmarks as number[]).slice();
      const base = lm[COORD] ?? 0;
      clean.push(base);
      const jittered = base + noise(i);
      lm[COORD] = jittered;
      noisy.push(jittered);
      filtered.push((filter.next(lm, f.ts) as number[])[COORD] ?? 0);
    });

    // The filtered path is smoother than the injected-noise path.
    expect(pathLength(filtered)).toBeLessThan(pathLength(noisy));
    // Sanity: there was real jitter to remove (noisy longer than the clean ramp).
    expect(pathLength(noisy)).toBeGreaterThan(pathLength(clean));
  });

  it('tracks the underlying signal within a bounded lag', () => {
    const filter = createLandmarkFilter();
    let maxLag = 0;
    frames.forEach((f, i) => {
      const lm = (f.landmarks as number[]).slice();
      const base = lm[COORD] ?? 0;
      lm[COORD] = base + noise(i);
      const out = (filter.next(lm, f.ts) as number[])[COORD] ?? 0;
      maxLag = Math.max(maxLag, Math.abs(out - base));
    });
    // Filtered output stays close to the clean underlying trajectory (lag bound).
    expect(maxLag).toBeLessThan(0.05);
  });

  it('leaves an unfiltered point untouched', () => {
    const filter = createLandmarkFilter();
    // Point 1 is not in the filtered set; every coordinate must pass through.
    const out = frames.map((f) => {
      const lm = f.landmarks as number[];
      return (filter.next(lm, f.ts) as number[])[1 * 3] ?? 0;
    });
    const raw = frames.map((f) => (f.landmarks as number[])[1 * 3] ?? 0);
    expect(out).toEqual(raw);
  });
});
