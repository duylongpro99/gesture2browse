import { describe, it, expect } from 'vitest';
import { replayFrames, type FrameInput } from '@gesture/gesture-core';
import { PALM_CLUTCH_MS, STABLE_TRACK_MS, PINCH_IN, PINCH_OUT, TAP_MAX_MS } from '@gesture/gesture-core';

function arm(frames: FrameInput[], from = 0): number {
  let ts = from;
  for (; ts <= from + PALM_CLUTCH_MS + STABLE_TRACK_MS + 100; ts += 100)
    frames.push({ ts, present: true, gesture: 'Open_Palm', score: 0.9, velocity: { vx: 0, vy: 0 } });
  return ts;
}

// A pinch-tap over target 5, in `pinch → out` within TAP_MAX_MS, starting at `ts`.
function tap(frames: FrameInput[], ts: number): number {
  frames.push({ ts, present: true, gesture: 'Pointing_Up', score: 0.9, velocity: { vx: 0, vy: 0 }, pointer: { x: 0.5, y: 0.5 }, hoverId: 5, pinch: PINCH_IN - 0.05 }); ts += TAP_MAX_MS - 100;
  frames.push({ ts, present: true, gesture: 'Pointing_Up', score: 0.9, velocity: { vx: 0, vy: 0 }, pointer: { x: 0.5, y: 0.5 }, hoverId: 5, pinch: PINCH_OUT + 0.05 }); ts += 100;
  return ts;
}

describe('the stable-tracking gate blocks gestures right after a hand (re)appears', () => {
  it('a pinch within STABLE_TRACK_MS of reappearance fires nothing; after it, it clicks', () => {
    const frames: FrameInput[] = [];
    let ts = arm(frames);
    // Hand vanishes, resetting the stable-track timer.
    frames.push({ ts, present: false, score: 0, velocity: { vx: 0, vy: 0 } }); ts += 100;
    // Reappears and immediately taps — inside the stable window → no Click.
    ts = tap(frames, ts);
    const early = replayFrames(frames.slice());
    expect(early.intents.some((i) => i.type === 'Click')).toBe(false);

    // Keep the hand present past STABLE_TRACK_MS, then tap again → Click.
    for (let k = 0; k < Math.ceil(STABLE_TRACK_MS / 100) + 2; k++, ts += 100)
      frames.push({ ts, present: true, gesture: 'Pointing_Up', score: 0.9, velocity: { vx: 0, vy: 0 }, pointer: { x: 0.5, y: 0.5 }, hoverId: 5, pinch: 0.9 });
    tap(frames, ts);
    const late = replayFrames(frames);
    expect(late.intents).toContainEqual({ type: 'Click', id: 5 });
  });
});
