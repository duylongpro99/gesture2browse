import { describe, it, expect } from 'vitest';
import {
  LandmarkBuffer,
  DEFAULT_LANDMARK_CAPACITY,
} from '../entrypoints/offscreen/landmark-buffer';

// A distinct flat [x,y,z]*21 landmark array, tagged by `n` in its first slot so
// tests can tell frames apart without caring about the other 62 numbers.
const lm = (n: number): number[] => [n, ...Array(62).fill(0)];

describe('LandmarkBuffer', () => {
  it('starts disarmed and records nothing until armed', () => {
    const b = new LandmarkBuffer(4);
    expect(b.isArmed).toBe(false);
    b.record(lm(1)); // ignored while disarmed
    expect(b.latest()).toBeUndefined();
    expect(b.window()).toEqual([]);
  });

  it('records the current landmarks while armed and exposes the latest', () => {
    const b = new LandmarkBuffer(4);
    b.arm(true);
    b.record(lm(1));
    b.record(lm(2));
    expect(b.latest()).toEqual(lm(2));
    expect(b.window()).toEqual([lm(1), lm(2)]);
  });

  it('is bounded to capacity, dropping the oldest frames', () => {
    const b = new LandmarkBuffer(2);
    b.arm(true);
    b.record(lm(1));
    b.record(lm(2));
    b.record(lm(3));
    expect(b.window()).toEqual([lm(2), lm(3)]); // lm(1) evicted
    expect(b.latest()).toEqual(lm(3));
  });

  it('clears the ring on disarm so nothing lingers in steady state', () => {
    const b = new LandmarkBuffer(4);
    b.arm(true);
    b.record(lm(1));
    b.arm(false);
    expect(b.isArmed).toBe(false);
    expect(b.window()).toEqual([]);
    expect(b.latest()).toBeUndefined();
    b.record(lm(2)); // still ignored — disarmed
    expect(b.window()).toEqual([]);
  });

  it('re-arming keeps the buffer empty (no pre-arm contents leak forward)', () => {
    const b = new LandmarkBuffer(4);
    b.arm(true);
    b.record(lm(1));
    b.arm(false);
    b.arm(true);
    expect(b.window()).toEqual([]);
  });

  it('arm(on) is idempotent — re-arming while already armed keeps contents', () => {
    const b = new LandmarkBuffer(4);
    b.arm(true);
    b.record(lm(1));
    b.arm(true); // no-op, must not clear
    expect(b.window()).toEqual([lm(1)]);
  });

  it('defaults to a sane rolling capacity', () => {
    const b = new LandmarkBuffer();
    b.arm(true);
    for (let i = 0; i < DEFAULT_LANDMARK_CAPACITY + 10; i++) b.record(lm(i));
    expect(b.window().length).toBe(DEFAULT_LANDMARK_CAPACITY);
  });
});
