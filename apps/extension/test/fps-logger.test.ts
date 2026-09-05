import { describe, it, expect } from 'vitest';
import { windowFps, FpsLogger } from '../entrypoints/offscreen/fps-logger';

describe('windowFps', () => {
  it('is 0 fps for an empty window', () => {
    expect(windowFps([], 1000, 1000)).toEqual({ frames: 0, windowMs: 1000, fps: 0 });
  });

  it('counts frames in the window and divides by the window seconds', () => {
    // 30 marks at 30 ms spacing (all inside the (0, 1000] window) -> 30 fps.
    const marks = Array.from({ length: 30 }, (_, i) => (i + 1) * 30);
    const r = windowFps(marks, 1000, 1000);
    expect(r.frames).toBe(30);
    expect(r.fps).toBeCloseTo(30, 5);
  });

  it('excludes marks that have rolled out of the trailing window', () => {
    const marks = [10, 500, 1500, 1900]; // window (1000, 2000]
    const r = windowFps(marks, 2000, 1000);
    expect(r.frames).toBe(2); // 1500 and 1900 only
    expect(r.fps).toBeCloseTo(2, 5);
  });

  it('treats the boundaries as (from, now]: excludes from, includes now', () => {
    // now=2000, windowMs=1000 -> from=1000. Mark at 1000 excluded, at 2000 included.
    const r = windowFps([1000, 1001, 2000], 2000, 1000);
    expect(r.frames).toBe(2);
  });
});

describe('FpsLogger', () => {
  it('accumulates marks and reports the trailing-window fps', () => {
    const log = new FpsLogger(1000);
    for (let i = 1; i <= 28; i++) log.mark(i * 30); // all inside (0, 1000]
    const r = log.sample(1000);
    expect(r.frames).toBe(28);
    expect(r.fps).toBeCloseTo(28, 5);
  });

  it('prunes stale marks so a later window does not double-count', () => {
    const log = new FpsLogger(1000);
    log.mark(100);
    log.mark(200);
    // Advance well past the first window; old marks must be dropped.
    log.mark(2500);
    log.mark(2900);
    const r = log.sample(3000);
    expect(r.frames).toBe(2); // 2500 and 2900 only
  });
});
