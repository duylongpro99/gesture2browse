import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { createGestureMachine, PALM_CLUTCH_MS, SCROLL_STEP, type FrameInput } from '@gesture/gesture-core';
import type { Intent } from '@gesture/protocol';

function run(frames: FrameInput[]): { value: unknown; intents: Intent[] } {
  const a = createActor(createGestureMachine());
  const intents: Intent[] = [];
  a.on('Arm', (e) => intents.push(e));
  a.on('Pause', (e) => intents.push(e));
  a.on('Scroll', (e) => intents.push(e));
  a.start();
  for (const frame of frames) a.send({ type: 'FRAME', frame });
  return { value: a.getSnapshot().value, intents };
}

const palm = (ts: number): FrameInput => ({ ts, present: true, gesture: 'Open_Palm', score: 1, velocity: { vx: 0, vy: 0 } });
const fist = (ts: number, vy: number): FrameInput => ({ ts, present: true, gesture: 'Closed_Fist', score: 1, velocity: { vx: 0, vy } });

// Hold Open_Palm from ts0 until the clutch elapses, at 100 ms/frame — long
// enough that the VOTE_FRAMES confidence vote is satisfied well before the hold
// time. Ends on the frame at exactly ts0 + PALM_CLUTCH_MS (the arming frame).
function palmHold(ts0: number): FrameInput[] {
  const frames: FrameInput[] = [];
  for (let ts = ts0; ts <= ts0 + PALM_CLUTCH_MS; ts += 100) frames.push(palm(ts));
  return frames;
}
// A run of Closed_Fist frames long enough to clear the vote window and scroll.
function fistRun(ts0: number, count: number, vy: number): FrameInput[] {
  return Array.from({ length: count }, (_, k) => fist(ts0 + k * 33, vy));
}

describe('gesture FSM skeleton', () => {
  it('starts Paused', () => {
    const a = createActor(createGestureMachine());
    a.start();
    expect(a.getSnapshot().value).toBe('Paused');
  });

  it('arms after Open_Palm is held past PALM_CLUTCH_MS (and the vote) and emits Arm', () => {
    const { value, intents } = run(palmHold(0));
    expect(value).toEqual({ Armed: 'Idle' });
    expect(intents).toContainEqual({ type: 'Arm' });
  });

  it('does not arm before the clutch time elapses', () => {
    const { value, intents } = run([palm(0), palm(500), palm(PALM_CLUTCH_MS - 1)]);
    expect(value).toBe('Paused');
    expect(intents).toHaveLength(0);
  });

  it('does not arm on a palm shorter than the confidence vote', () => {
    // Two palm frames already span PALM_CLUTCH_MS, but the vote needs three.
    const { value, intents } = run([palm(0), palm(PALM_CLUTCH_MS)]);
    expect(value).toBe('Paused');
    expect(intents).toHaveLength(0);
  });

  it('emits Scroll from fist motion once Armed and enters Armed.Scrolling', () => {
    const { value, intents } = run([...palmHold(0), ...fistRun(PALM_CLUTCH_MS + 33, 3, SCROLL_STEP * 4)]);
    expect(intents.some((i) => i.type === 'Scroll')).toBe(true);
    expect(value).toEqual({ Armed: 'Scrolling' });
  });

  it('returns Armed.Scrolling to Armed.Idle when the fist releases', () => {
    const { value } = run([
      ...palmHold(0),
      ...fistRun(PALM_CLUTCH_MS + 33, 3, SCROLL_STEP * 4),
      { ts: PALM_CLUTCH_MS + 200, present: false, score: 0, velocity: { vx: 0, vy: 0 } },
    ]);
    expect(value).toEqual({ Armed: 'Idle' });
  });

  it('still Pauses from Armed (any substate) after another palm clutch hold', () => {
    const { value, intents } = run([
      ...palmHold(0), // arms -> Armed.Idle
      ...palmHold(PALM_CLUTCH_MS + 100), // a fresh palm hold while Armed -> Pause
    ]);
    expect(value).toBe('Paused');
    expect(intents).toContainEqual({ type: 'Pause' });
  });
});
