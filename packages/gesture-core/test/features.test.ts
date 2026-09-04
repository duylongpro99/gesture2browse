import { describe, it, expect } from 'vitest';
import { pinchDistance, fingerExtension } from '@gesture/gesture-core';

// Build a landmark array where thumb tip (4) and index tip (8) sit at a chosen
// separation, everything scaled against wrist(0)->middle-MCP(9).
function landmarks(overrides: Record<number, [number, number, number]>): number[] {
  const l = new Array(63).fill(0);
  for (const [i, [x, y, z]] of Object.entries(overrides)) {
    const idx = Number(i) * 3;
    l[idx] = x;
    l[idx + 1] = y;
    l[idx + 2] = z;
  }
  return l;
}

describe('pinchDistance', () => {
  it('is larger when thumb and index are far apart', () => {
    const base = { 0: [0, 0, 0] as [number, number, number], 9: [0, 1, 0] as [number, number, number] };
    const near = pinchDistance(
      landmarks({ ...base, 4: [0, 0, 0], 8: [0.05, 0, 0] }),
    );
    const far = pinchDistance(
      landmarks({ ...base, 4: [0, 0, 0], 8: [0.5, 0, 0] }),
    );
    expect(far).toBeGreaterThan(near);
  });
});

describe('fingerExtension', () => {
  it('flags an extended finger whose tip is further from the wrist than its pip', () => {
    // index tip(8) far, index pip(6) near -> extended; others collapsed at origin -> not.
    const l = landmarks({ 0: [0, 0, 0], 6: [0, 0.1, 0], 8: [0, 0.9, 0] });
    const ext = fingerExtension(l);
    expect(ext[1]).toBe(true);
    expect(ext[0]).toBe(false);
  });
});
