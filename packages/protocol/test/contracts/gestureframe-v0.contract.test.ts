// CONTRACT (frozen at plan time, milestone 0A). Consumers: 0B, 0D, 1A.
// Asserts what a GestureFrame consumer (1A: offscreen → content-script/service
// worker) reads from GestureFrame v0, through the @gesture/protocol public export.
// Fails until execute (impl Task 2) implements the schema. Execute must NOT edit this file.
import { describe, it, expect } from 'vitest';
import { GestureFrameSchema, GestureLabel } from '@gesture/protocol';

const frame = {
  ts: 123.4,
  present: true,
  handedness: 'Right',
  gesture: 'Closed_Fist',
  score: 0.82,
  pinch: 0.24,
  fingers: [false, false, false, false, false],
  velocity: { vx: 0.1, vy: -0.2 },
  scale: 0.31,
  pointer: { x: 0.5, y: 0.5 },
};

describe('contract: GestureFrame v0 (0B, 0D, 1A)', () => {
  it('parses a steady-state frame with no landmarks (steady state omits them)', () => {
    const f = GestureFrameSchema.parse(frame);
    expect(f.landmarks).toBeUndefined();
  });

  it('exposes the pointer a content-script consumer drives the cursor with', () => {
    const f = GestureFrameSchema.parse(frame);
    expect(f.pointer.x).toBeTypeOf('number');
    expect(f.pointer.y).toBeTypeOf('number');
  });

  it('exposes gesture (a GestureLabel), score, pinch and present for the FSM consumer', () => {
    const f = GestureFrameSchema.parse(frame);
    if (f.gesture !== undefined) expect(GestureLabel.options).toContain(f.gesture);
    expect(f.score).toBeTypeOf('number');
    expect(f.pinch).toBeTypeOf('number');
    expect(f.present).toBe(true);
  });

  it('models finger extension as exactly five booleans', () => {
    const f = GestureFrameSchema.parse(frame);
    expect(f.fingers).toHaveLength(5);
    expect(() => GestureFrameSchema.parse({ ...frame, fingers: [true, false] })).toThrow();
  });

  it('carries raw landmarks (length 63) only when recording', () => {
    const rec = GestureFrameSchema.parse({ ...frame, landmarks: Array(63).fill(0) });
    expect(rec.landmarks).toHaveLength(63);
    expect(() => GestureFrameSchema.parse({ ...frame, landmarks: Array(62).fill(0) })).toThrow();
  });
});
