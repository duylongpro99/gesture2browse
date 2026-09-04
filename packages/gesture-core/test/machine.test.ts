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

describe('gesture FSM skeleton', () => {
  it('starts Paused', () => {
    const a = createActor(createGestureMachine());
    a.start();
    expect(a.getSnapshot().value).toBe('Paused');
  });

  it('arms after Open_Palm is held for PALM_CLUTCH_MS and emits Arm', () => {
    const { value, intents } = run([palm(0), palm(PALM_CLUTCH_MS)]);
    expect(value).toBe('Armed');
    expect(intents).toContainEqual({ type: 'Arm' });
  });

  it('does not arm before the clutch time elapses', () => {
    const { value, intents } = run([palm(0), palm(PALM_CLUTCH_MS - 1)]);
    expect(value).toBe('Paused');
    expect(intents).toHaveLength(0);
  });

  it('emits Scroll from fist motion once Armed', () => {
    const { intents } = run([palm(0), palm(PALM_CLUTCH_MS), fist(PALM_CLUTCH_MS + 33, SCROLL_STEP * 4)]);
    expect(intents.some((i) => i.type === 'Scroll')).toBe(true);
  });
});
