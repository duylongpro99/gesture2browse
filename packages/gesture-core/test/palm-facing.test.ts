import { describe, it, expect } from 'vitest';
import { palmFacing } from '@gesture/gesture-core';

// Flat 63-array, all zero except the three points palmFacing reads.
function makeLandmarks(
  points: Partial<Record<0 | 5 | 17, [number, number, number]>>,
): number[] {
  const l = new Array<number>(63).fill(0);
  for (const [idx, [x, y, z]] of Object.entries(points)) {
    const b = Number(idx) * 3;
    l[b] = x;
    l[b + 1] = y;
    l[b + 2] = z;
  }
  return l;
}

describe('palmFacing', () => {
  it('returns true when the palm-plane normal points toward the camera (n.z < 0)', () => {
    // wrist=(0,0,0), indexMCP=(0,1,0), pinkyMCP=(1,0,0)
    // v1 x v2 = (0,1,0) x (1,0,0) = (0*0-0*0, 0*1-0*0, 0*0-1*1) = (0,0,-1)
    const landmarks = makeLandmarks({
      0: [0, 0, 0],
      5: [0, 1, 0],
      17: [1, 0, 0],
    });
    expect(palmFacing(landmarks)).toBe(true);
  });

  it('returns false when the palm-plane normal points away from the camera (n.z > 0)', () => {
    // wrist=(0,0,0), indexMCP=(1,0,0), pinkyMCP=(0,1,0)
    // v1 x v2 = (1,0,0) x (0,1,0) = (0*0-0*1, 0*0-1*0, 1*1-0*0) = (0,0,1)
    const landmarks = makeLandmarks({
      0: [0, 0, 0],
      5: [1, 0, 0],
      17: [0, 1, 0],
    });
    expect(palmFacing(landmarks)).toBe(false);
  });
});
