import { describe, it, expect } from 'vitest';
import { normalizeLandmarks, pinchDistance, fingerExtension } from '@gesture/gesture-core';
const raw = Array.from({ length: 63 }, (_, i) => (i % 3) * 0.1 + Math.floor(i / 3) * 0.01);
describe('normalizeLandmarks', () => {
  it('places the wrist (landmark 0) at the origin', () => {
    const n = normalizeLandmarks(raw);
    expect(n[0]).toBeCloseTo(0);
    expect(n[1]).toBeCloseTo(0);
    expect(n[2]).toBeCloseTo(0);
  });
  it('returns 63 numbers', () => {
    expect(normalizeLandmarks(raw)).toHaveLength(63);
  });
});
describe('features', () => {
  it('pinchDistance is non-negative', () => {
    expect(pinchDistance(raw)).toBeGreaterThanOrEqual(0);
  });
  it('fingerExtension returns five booleans', () => {
    expect(fingerExtension(raw)).toHaveLength(5);
  });
});
