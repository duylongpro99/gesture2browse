import { describe, it, expect } from 'vitest';
import { replayFrames, PALM_CLUTCH_MS, SCROLL_STEP, type FrameInput } from '@gesture/gesture-core';

// E1: palm-hold >= PALM_CLUTCH_MS arms, then a run of fist frames with
// qualifying vertical velocity scrolls repeatedly.
function script(): FrameInput[] {
  const frames: FrameInput[] = [
    { ts: 0, present: true, gesture: 'Open_Palm', score: 0.9, velocity: { vx: 0, vy: 0 } },
    { ts: PALM_CLUTCH_MS, present: true, gesture: 'Open_Palm', score: 0.9, velocity: { vx: 0, vy: 0 } },
  ];
  for (let k = 1; k <= 3; k++) {
    frames.push({
      ts: PALM_CLUTCH_MS + k * 33,
      present: true,
      gesture: 'Closed_Fist',
      score: 0.9,
      velocity: { vx: 0, vy: SCROLL_STEP * 4 },
    });
  }
  return frames;
}

describe('replayFrames: Arm then repeated Scroll (E1)', () => {
  it('emits [Arm, Scroll, Scroll, Scroll]', () => {
    const { intents } = replayFrames(script());
    expect(intents.map((i) => i.type)).toEqual(['Arm', 'Scroll', 'Scroll', 'Scroll']);
  });

  it('logs Paused -> Armed.* (Arm) and Armed.Idle -> Armed.Scrolling', () => {
    const { transitions } = replayFrames(script());

    const arming = transitions.find((t) => t.intent?.type === 'Arm');
    expect(arming).toBeDefined();
    expect(arming?.from).toBe('Paused');
    expect(arming?.to.startsWith('Armed')).toBe(true);

    const scrollEnter = transitions.find((t) => t.from === 'Armed.Idle' && t.to === 'Armed.Scrolling');
    expect(scrollEnter).toBeDefined();
    expect(scrollEnter?.intent?.type).toBe('Scroll');
  });
});
