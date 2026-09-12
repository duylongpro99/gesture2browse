import { describe, it, expect } from 'vitest';
import { createGestureMachine, replayFrames, type FrameInput } from '@gesture/gesture-core';
import { PALM_CLUTCH_MS, STABLE_TRACK_MS, HOLD_VICTORY_MS, COOLDOWN_HOLD_MS } from '@gesture/gesture-core';

function arm(frames: FrameInput[], from = 0): number {
  let ts = from;
  for (; ts <= from + PALM_CLUTCH_MS + STABLE_TRACK_MS + 100; ts += 100)
    frames.push({ ts, present: true, gesture: 'Open_Palm', score: 0.9, velocity: { vx: 0, vy: 0 } });
  return ts;
}

describe('FSM structure', () => {
  it('exposes the full Armed sub-tree', () => {
    const m = createGestureMachine();
    for (const s of ['Idle', 'Pointing', 'PinchDown', 'Dragging', 'Scrolling', 'SwipeArmed', 'Hold'])
      expect(m.states.Armed.states[s]).toBeDefined();
    expect(m.states.Paused).toBeDefined();
  });
});

describe('FSM invariants', () => {
  it('does not fire any action gesture before arming', () => {
    // Victory held long, but the machine never armed (no palm clutch) → no HoldGesture.
    const frames: FrameInput[] = [];
    for (let ts = 0; ts <= HOLD_VICTORY_MS + 400; ts += 100)
      frames.push({ ts, present: true, gesture: 'Victory', score: 0.9, velocity: { vx: 0, vy: 0 } });
    const { intents } = replayFrames(frames);
    expect(intents.filter((i) => i.type !== 'Arm')).toHaveLength(0);
    expect(intents.some((i) => i.type === 'Arm')).toBe(false);
  });

  it('a cooldown stops a continuously held pose from machine-gunning', () => {
    // Victory held without release keeps satisfying the hold time every frame; only
    // the cooldown prevents a fire on every subsequent frame. Held < COOLDOWN_HOLD_MS
    // past the first fire → exactly one HoldGesture.
    const frames: FrameInput[] = [];
    let ts = arm(frames);
    for (let held = 0; held <= HOLD_VICTORY_MS + 300; held += 100, ts += 100)
      frames.push({ ts, present: true, gesture: 'Victory', score: 0.9, velocity: { vx: 0, vy: 0 } });
    const { intents } = replayFrames(frames);
    expect(intents.filter((i) => i.type === 'HoldGesture')).toHaveLength(1);
    expect(COOLDOWN_HOLD_MS).toBeGreaterThan(HOLD_VICTORY_MS);
  });
});
