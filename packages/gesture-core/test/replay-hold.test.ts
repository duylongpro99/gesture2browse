import { describe, it, expect } from 'vitest';
import { replayFrames, type FrameInput } from '@gesture/gesture-core';
import { PALM_CLUTCH_MS, STABLE_TRACK_MS, HOLD_VICTORY_MS } from '@gesture/gesture-core';

function arm(frames: FrameInput[], from = 0): number {
  let ts = from;
  for (; ts <= from + PALM_CLUTCH_MS + STABLE_TRACK_MS + 100; ts += 100)
    frames.push({ ts, present: true, gesture: 'Open_Palm', score: 0.9, velocity: { vx: 0, vy: 0 } });
  return ts;
}

describe('a held pose emits HoldGesture{kind}', () => {
  it('Victory held past HOLD_VICTORY_MS emits HoldGesture{kind:"Victory"}', () => {
    const frames: FrameInput[] = [];
    let ts = arm(frames);
    for (let held = 0; held <= HOLD_VICTORY_MS + 200; held += 100, ts += 100)
      frames.push({ ts, present: true, gesture: 'Victory', score: 0.9, velocity: { vx: 0, vy: 0 } });
    const { intents } = replayFrames(frames);
    expect(intents).toContainEqual({ type: 'HoldGesture', kind: 'Victory' });
  });

  it('Victory dropped before HOLD_VICTORY_MS emits nothing', () => {
    const frames: FrameInput[] = [];
    let ts = arm(frames);
    // Only ~300 ms of Victory (enough to vote, not to elapse the hold), then neutral.
    for (let k = 0; k < 4; k++, ts += 100)
      frames.push({ ts, present: true, gesture: 'Victory', score: 0.9, velocity: { vx: 0, vy: 0 } });
    frames.push({ ts, present: true, gesture: 'none', score: 0.1, velocity: { vx: 0, vy: 0 } });
    const { intents } = replayFrames(frames);
    expect(intents.some((i) => i.type === 'HoldGesture')).toBe(false);
  });
});
