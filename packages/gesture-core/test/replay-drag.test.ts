import { describe, it, expect } from 'vitest';
import { replayFrames, type FrameInput } from '@gesture/gesture-core';
import { PALM_CLUTCH_MS, STABLE_TRACK_MS, PINCH_IN, PINCH_OUT, TAP_MAX_MS } from '@gesture/gesture-core';

function arm(frames: FrameInput[], from = 0): number {
  let ts = from;
  for (; ts <= from + PALM_CLUTCH_MS + STABLE_TRACK_MS + 100; ts += 100)
    frames.push({ ts, present: true, gesture: 'Open_Palm', score: 0.9, velocity: { vx: 0, vy: 0 } });
  return ts;
}

describe('a pinch held past TAP_MAX_MS drags', () => {
  it('emits DragStart{id} on the long pinch and DragEnd on release', () => {
    const frames: FrameInput[] = [];
    let ts = arm(frames);
    const at = (pinch: number) => ({ ts, present: true, gesture: 'Pointing_Up' as const, score: 0.9, velocity: { vx: 0, vy: 0 }, pointer: { x: 0.4, y: 0.4 }, hoverId: 9, pinch });
    frames.push(at(0.5)); ts += 100; // point
    frames.push(at(PINCH_IN - 0.05)); ts += TAP_MAX_MS + 100; // pinch in, then hold past TAP_MAX
    frames.push(at(PINCH_IN - 0.05)); ts += 100; // still pinched, elapsed > TAP_MAX → DragStart
    frames.push(at(PINCH_OUT + 0.05)); // release → DragEnd
    const { intents } = replayFrames(frames);
    expect(intents).toContainEqual({ type: 'DragStart', id: 9 });
    expect(intents).toContainEqual({ type: 'DragEnd' });
    // Order: DragStart before DragEnd, no Click.
    expect(intents.some((i) => i.type === 'Click')).toBe(false);
    const s = intents.findIndex((i) => i.type === 'DragStart');
    const e = intents.findIndex((i) => i.type === 'DragEnd');
    expect(s).toBeLessThan(e);
  });
});
