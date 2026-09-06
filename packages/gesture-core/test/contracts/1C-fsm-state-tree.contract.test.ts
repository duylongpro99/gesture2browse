// CONTRACT (frozen at plan time, milestone 1A). Consumers: 1C, 2A.
// The FSM state tree is fixed here: gesture-core owns it, and later milestones
// ADD sibling substates (1C: Armed.Pointing/PinchDown/Dragging/SwipeArmed/Hold;
// 2A: Agent.*) and the transition log feeds 1D.5 diagnostics. This asserts, from
// a consumer's side, (a) the hierarchical Armed.{Idle,Scrolling} naming and
// (b) that a replay yields the frozen TransitionLogEntry shape and the Arm/Scroll
// intent sequence. FAILS today (flat machine, no Armed substates, no replayFrames,
// no TransitionLogEntrySchema). Execute must NOT edit this file.
import { describe, it, expect } from 'vitest';
import {
  createGestureMachine,
  replayFrames,
  PALM_CLUTCH_MS,
  type FrameInput,
} from '@gesture/gesture-core';
import { TransitionLogEntrySchema } from '@gesture/protocol';

// Hold Open_Palm past the clutch time, then Closed_Fist with vertical velocity.
function script(): FrameInput[] {
  const frames: FrameInput[] = [];
  for (let ts = 0; ts <= PALM_CLUTCH_MS + 100; ts += 100) {
    frames.push({ ts, present: true, gesture: 'Open_Palm', score: 0.9, velocity: { vx: 0, vy: 0 } });
  }
  for (let k = 1; k <= 5; k++) {
    const ts = PALM_CLUTCH_MS + 100 + k * 100;
    frames.push({ ts, present: true, gesture: 'Closed_Fist', score: 0.9, velocity: { vx: 0, vy: 0.3 } });
  }
  return frames;
}

describe('contract: FSM state tree + transition log (1C, 2A)', () => {
  it('exposes a hierarchical Armed state with Idle and Scrolling substates', () => {
    const m = createGestureMachine();
    expect(m.states.Paused).toBeDefined();
    expect(m.states.Armed.states.Idle).toBeDefined();
    expect(m.states.Armed.states.Scrolling).toBeDefined();
  });

  it('replays a frame sequence into Intents and a TransitionLogEntry list', () => {
    const { intents, transitions } = replayFrames(script());

    // Intent sequence the dispatcher consumes: Arm, then at least one Scroll.
    expect(intents.some((i) => i.type === 'Arm')).toBe(true);
    const scroll = intents.find((i) => i.type === 'Scroll');
    expect(scroll).toBeDefined();
    if (scroll?.type === 'Scroll') expect(scroll.dy).toBeTypeOf('number');

    // Every transition matches the frozen shape { ts, from, to, event, intent? }.
    expect(transitions.length).toBeGreaterThan(0);
    for (const t of transitions) TransitionLogEntrySchema.parse(t);

    // The arming transition leaves Paused for an Armed.* state and carries Arm.
    const armed = transitions.find((t) => t.intent?.type === 'Arm');
    expect(armed).toBeDefined();
    expect(armed?.from).toBe('Paused');
    expect(armed?.to.startsWith('Armed')).toBe(true);
  });
});
