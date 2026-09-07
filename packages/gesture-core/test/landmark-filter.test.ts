import { describe, it, expect } from 'vitest';
import { createLandmarkFilter } from '@gesture/gesture-core';

function baseLandmarks(): number[] {
  // 21 points x 3 coords, distinct values so pass-through vs smoothing is obvious.
  return Array.from({ length: 63 }, (_, i) => i + 1);
}

describe('createLandmarkFilter', () => {
  it('smooths points 0, 4, 8, 9 and passes every other coordinate through unchanged', () => {
    const filter = createLandmarkFilter();
    const frame1 = baseLandmarks();
    const out1 = filter.next(frame1, 0);
    // First call: OneEuroFilter returns the raw value on warm-up, so frame1 == out1.
    expect(out1).toEqual(frame1);

    const frame2 = baseLandmarks().map((v) => v + 100); // big jump on every coordinate
    const out2 = filter.next(frame2, 33);

    const filteredPoints = [0, 4, 8, 9];
    for (let point = 0; point < 21; point++) {
      const base = point * 3;
      for (let c = 0; c < 3; c++) {
        const idx = base + c;
        if (filteredPoints.includes(point)) {
          // Smoothed: pulled toward the previous value, not equal to the raw jump.
          expect(out2[idx]).not.toBe(frame2[idx]);
        } else {
          // Untouched: passes through byte-identical.
          expect(out2[idx]).toBe(frame2[idx]);
        }
      }
    }
  });

  it('reduces jitter on a noisy sequence for a filtered point', () => {
    const filter = createLandmarkFilter();
    // Point 4 (thumb-tip), x-coordinate: noisy signal oscillating around 10.
    const noisy = [10, 10.5, 9.5, 10.6, 9.4, 10.7, 9.3, 10.8, 9.2, 10.9];
    const outputs: number[] = [];
    for (let i = 0; i < noisy.length; i++) {
      const landmarks = new Array<number>(63).fill(0);
      landmarks[4 * 3] = noisy[i] ?? 0;
      const out = filter.next(landmarks, i * 33);
      outputs.push(out[4 * 3] ?? 0);
    }

    function variance(xs: number[]): number {
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      return xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
    }

    expect(variance(outputs)).toBeLessThan(variance(noisy));
  });
});
