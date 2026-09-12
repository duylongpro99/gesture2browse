// CONTRACT (frozen at plan time, milestone 1C). Consumer: 2A.
// 1C completes the Armed.* state tree (arch §5); 2A adds Agent.Proposing /
// Agent.AwaitingConfirm as siblings and drives them off HoldGesture (Victory ->
// propose, Thumb_Up -> confirm). This asserts, from 2A's side, (a) the full
// Armed sub-tree exists so Agent.* has a stable tree to attach to, and (b) a
// Victory hold replays into a HoldGesture{kind:'Victory'} intent. FAILS today
// (Armed has only Idle/Scrolling; no Hold state; HOLD_VICTORY_MS/STABLE_TRACK_MS
// do not exist). Execute must NOT edit this file.
import { describe, it, expect } from 'vitest';
import {
  createGestureMachine,
  replayFrames,
  type FrameInput,
  PALM_CLUTCH_MS,
  STABLE_TRACK_MS,
  HOLD_VICTORY_MS,
} from '@gesture/gesture-core';

describe('contract: FSM full Armed.* state tree (2A)', () => {
  it('exposes the full Armed sub-tree Agent.* attaches beside', () => {
    const m = createGestureMachine();
    expect(m.states.Paused).toBeDefined();
    for (const s of ['Idle', 'Pointing', 'PinchDown', 'Dragging', 'Scrolling', 'SwipeArmed', 'Hold']) {
      expect(m.states.Armed.states[s]).toBeDefined();
    }
  });

  it('replays a Victory hold into a HoldGesture{kind:"Victory"} the agent plane consumes', () => {
    const frames: FrameInput[] = [];
    let ts = 0;
    // Arm: hold Open_Palm past the clutch time (+ stable-tracking gate).
    for (; ts <= PALM_CLUTCH_MS + STABLE_TRACK_MS + 200; ts += 100) {
      frames.push({ ts, present: true, gesture: 'Open_Palm', score: 0.9, velocity: { vx: 0, vy: 0 } });
    }
    // Hold Victory past its hold time.
    for (let held = 0; held <= HOLD_VICTORY_MS + 200; held += 100, ts += 100) {
      frames.push({ ts, present: true, gesture: 'Victory', score: 0.9, velocity: { vx: 0, vy: 0 } });
    }
    const { intents } = replayFrames(frames);
    expect(intents).toContainEqual({ type: 'HoldGesture', kind: 'Victory' });
  });
});
