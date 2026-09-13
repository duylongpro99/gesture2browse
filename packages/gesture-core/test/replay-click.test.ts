import { describe, it, expect } from 'vitest';
import { replayFrames, type FrameInput } from '@gesture/gesture-core';
import { PALM_CLUTCH_MS, STABLE_TRACK_MS, PINCH_IN, PINCH_OUT, TAP_MAX_MS } from '@gesture/gesture-core';

// Hold Open_Palm long enough to clutch Armed AND clear the stable-track gate.
function arm(frames: FrameInput[], from = 0): number {
  let ts = from;
  for (; ts <= from + PALM_CLUTCH_MS + STABLE_TRACK_MS + 100; ts += 100)
    frames.push({ ts, present: true, gesture: 'Open_Palm', score: 0.9, velocity: { vx: 0, vy: 0 } });
  return ts;
}

describe('pinch-tap emits Click{hoverId}', () => {
  it('a quick pinch over a hovered target clicks it', () => {
    const frames: FrameInput[] = [];
    let ts = arm(frames);
    // Point over target 17, pinch in then out within TAP_MAX_MS → Click.
    frames.push({ ts, present: true, gesture: 'Pointing_Up', score: 0.9, velocity: { vx: 0, vy: 0 }, pointer: { x: 0.5, y: 0.5 }, hoverId: 17, pinch: 0.5 }); ts += 100;
    frames.push({ ts, present: true, gesture: 'Pointing_Up', score: 0.9, velocity: { vx: 0, vy: 0 }, pointer: { x: 0.5, y: 0.5 }, hoverId: 17, pinch: PINCH_IN - 0.05 }); ts += TAP_MAX_MS - 100;
    frames.push({ ts, present: true, gesture: 'Pointing_Up', score: 0.9, velocity: { vx: 0, vy: 0 }, pointer: { x: 0.5, y: 0.5 }, hoverId: 17, pinch: PINCH_OUT + 0.05 });
    const { intents } = replayFrames(frames);
    expect(intents).toContainEqual({ type: 'Click', id: 17 });
    // No drag on a quick tap.
    expect(intents.some((i) => i.type === 'DragStart')).toBe(false);
  });
});
