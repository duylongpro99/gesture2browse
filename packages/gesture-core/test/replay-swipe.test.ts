import { describe, it, expect } from 'vitest';
import { replayFrames, type FrameInput } from '@gesture/gesture-core';
import { PALM_CLUTCH_MS, STABLE_TRACK_MS, SWIPE_V_MIN, COOLDOWN_SWIPE_MS } from '@gesture/gesture-core';

function arm(frames: FrameInput[], from = 0): number {
  let ts = from;
  for (; ts <= from + PALM_CLUTCH_MS + STABLE_TRACK_MS + 100; ts += 100)
    frames.push({ ts, present: true, gesture: 'Open_Palm', score: 0.9, velocity: { vx: 0, vy: 0 } });
  return ts;
}

const swipeFrame = (ts: number, vx: number): FrameInput => ({
  ts,
  present: true,
  gesture: 'Open_Palm',
  score: 0.9,
  velocity: { vx, vy: 0 },
});

describe('open-palm lateral motion emits Swipe once', () => {
  it('fires Swipe{dir:"right"} on rightward velocity and the cooldown blocks a second', () => {
    const frames: FrameInput[] = [];
    let ts = arm(frames);
    // Sustained rightward motion → accumulate displacement past SWIPE_D_MIN → Swipe.
    for (let k = 0; k < 4; k++, ts += 100) frames.push(swipeFrame(ts, SWIPE_V_MIN + 1));
    // Immediately try again within the cooldown window → blocked.
    for (let k = 0; k < 4; k++, ts += 100) frames.push(swipeFrame(ts, SWIPE_V_MIN + 1));
    const { intents } = replayFrames(frames);
    const swipes = intents.filter((i) => i.type === 'Swipe');
    expect(swipes).toEqual([{ type: 'Swipe', dir: 'right' }]);
    // Sanity: the two bursts are within one cooldown window.
    expect(COOLDOWN_SWIPE_MS).toBeGreaterThan(400);
  });

  it('fires Swipe{dir:"left"} on leftward velocity', () => {
    const frames: FrameInput[] = [];
    let ts = arm(frames);
    for (let k = 0; k < 4; k++, ts += 100) frames.push(swipeFrame(ts, -(SWIPE_V_MIN + 1)));
    const { intents } = replayFrames(frames);
    expect(intents).toContainEqual({ type: 'Swipe', dir: 'left' });
  });
});
