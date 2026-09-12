import { describe, it, expect } from 'vitest';
import { replayFrames, type FrameInput } from '@gesture/gesture-core';
import { PALM_CLUTCH_MS, STABLE_TRACK_MS, DWELL_MS, DWELL_RADIUS } from '@gesture/gesture-core';

function arm(frames: FrameInput[], from = 0): number {
  let ts = from;
  for (; ts <= from + PALM_CLUTCH_MS + STABLE_TRACK_MS + 100; ts += 100)
    frames.push({ ts, present: true, gesture: 'Open_Palm', score: 0.9, velocity: { vx: 0, vy: 0 } });
  return ts;
}

describe('dwell emits Click{hoverId} when dwellEnabled', () => {
  it('a pointer held within DWELL_RADIUS of the same target for DWELL_MS clicks it', () => {
    const frames: FrameInput[] = [];
    let ts = arm(frames);
    // Hold over target 3, small jitter INSIDE the radius, no pinch, for > DWELL_MS.
    for (let held = 0; held <= DWELL_MS + 200; held += 100, ts += 100) {
      frames.push({
        ts,
        present: true,
        gesture: 'Pointing_Up',
        score: 0.9,
        velocity: { vx: 0, vy: 0 },
        pointer: { x: 0.5 + (held % 200 === 0 ? 0 : DWELL_RADIUS / 2), y: 0.5 },
        hoverId: 3,
        pinch: 0.9,
        dwellEnabled: true,
      });
    }
    const { intents } = replayFrames(frames);
    expect(intents).toContainEqual({ type: 'Click', id: 3 });
  });

  it('does not dwell-click when dwellEnabled is absent', () => {
    const frames: FrameInput[] = [];
    let ts = arm(frames);
    for (let held = 0; held <= DWELL_MS + 200; held += 100, ts += 100) {
      frames.push({ ts, present: true, gesture: 'Pointing_Up', score: 0.9, velocity: { vx: 0, vy: 0 }, pointer: { x: 0.5, y: 0.5 }, hoverId: 3, pinch: 0.9 });
    }
    const { intents } = replayFrames(frames);
    expect(intents.some((i) => i.type === 'Click')).toBe(false);
  });
});
