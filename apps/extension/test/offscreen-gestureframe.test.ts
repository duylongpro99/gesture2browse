import { describe, it, expect } from 'vitest';
import { GestureFrameSchema } from '@gesture/protocol';
import { createGestureFrameSource } from '../entrypoints/offscreen/gesture-frame';

// Unit tests for the offscreen perception composition (Task 4, 1A vertical
// slice): normalize -> 1€ filter -> features -> classifier -> GestureFrame.
// Node (default) vitest environment — the source is pure TS, no DOM needed.

// A plausible flat [x,y,z]*21 open-hand landmark array in MediaPipe's normalized
// image space ([0,1]^2), fingers extended away from the wrist.
const OPEN_HAND: number[] = [
  0.5, 0.8, 0, // 0 wrist
  0.45, 0.7, 0, // 1
  0.42, 0.6, 0, // 2 thumb pip
  0.4, 0.5, 0, // 3
  0.38, 0.4, 0, // 4 thumb tip
  0.5, 0.65, 0, // 5
  0.5, 0.55, 0, // 6 index pip
  0.5, 0.45, 0, // 7
  0.5, 0.35, 0, // 8 index tip
  0.55, 0.65, 0, // 9 middle mcp
  0.55, 0.5, 0, // 10 middle pip
  0.55, 0.4, 0, // 11
  0.55, 0.3, 0, // 12 middle tip
  0.6, 0.65, 0, // 13
  0.6, 0.55, 0, // 14 ring pip
  0.6, 0.45, 0, // 15
  0.6, 0.35, 0, // 16 ring tip
  0.65, 0.68, 0, // 17
  0.65, 0.6, 0, // 18 pinky pip
  0.65, 0.52, 0, // 19
  0.65, 0.44, 0, // 20 pinky tip
];

describe('createGestureFrameSource', () => {
  it('derives a schema-valid GestureFrame with landmarks omitted (steady state)', () => {
    const source = createGestureFrameSource();
    const frame = source.next(OPEN_HAND, 1000);

    expect(GestureFrameSchema.safeParse(frame).success).toBe(true);
    expect(frame.landmarks).toBeUndefined();
    expect(frame.present).toBe(true);
    expect(frame.fingers).toHaveLength(5);
  });

  it('computes velocity from consecutive frames of a moving hand', () => {
    const source = createGestureFrameSource();
    source.next(OPEN_HAND, 1000);
    const moved = OPEN_HAND.map((v, i) => (i % 3 === 0 ? v + 0.1 : v)); // shift x
    const frame = source.next(moved, 1033);

    expect(GestureFrameSchema.safeParse(frame).success).toBe(true);
    expect(frame.velocity.vx).not.toBe(0);
  });

  it('reports present:false with a schema-valid frame when no hand is detected', () => {
    const source = createGestureFrameSource();
    source.next(OPEN_HAND, 1000); // warm up with a hand first
    const frame = source.next(null, 1033);

    expect(GestureFrameSchema.safeParse(frame).success).toBe(true);
    expect(frame.present).toBe(false);
    expect(frame.fingers).toEqual([false, false, false, false, false]);
    expect(frame.velocity).toEqual({ vx: 0, vy: 0 });
    expect(frame.landmarks).toBeUndefined();
  });
});
