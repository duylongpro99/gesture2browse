import { describe, it, expect, vi } from 'vitest';
import type { GestureFrame, Intent, TransitionLogEntry } from '@gesture/protocol';
import { createFrameConsumer, toFrameInput } from '../entrypoints/background/fsm';

// Unit tests for the GestureFrame -> gesture-core FSM wiring (Task 5, 1A
// vertical slice). No chrome.*/browser globals — dispatch/persist are plain
// spies, per docs/sdd/1A-vertical-slice/task-5-brief.md.

// pinch defaults to 1 (fully open, un-pinched) so palm/fist wiring frames do not
// trip the 1C pinch guard now that toFrameInput forwards pinch/pointer.
function frame(overrides: Partial<GestureFrame>): GestureFrame {
  return {
    ts: 0,
    present: true,
    score: 0,
    pinch: 1,
    fingers: [false, false, false, false, false],
    velocity: { vx: 0, vy: 0 },
    scale: 1,
    pointer: { x: 0.5, y: 0.5 },
    ...overrides,
  };
}

describe('toFrameInput', () => {
  it('projects the GestureFrame subset the FSM consumes (incl. 1C pinch/pointer)', () => {
    const gf = frame({ ts: 123, gesture: 'Open_Palm', score: 0.9, velocity: { vx: 1, vy: -2 } });
    expect(toFrameInput(gf)).toEqual({
      ts: 123,
      present: true,
      gesture: 'Open_Palm',
      score: 0.9,
      velocity: { vx: 1, vy: -2 },
      palmFacing: undefined,
      pinch: 1,
      pointer: { x: 0.5, y: 0.5 },
      hoverId: undefined,
      dwellEnabled: undefined,
    });
  });

  it('forwards palmFacing so the Task-4 palm-facing gate is active in production', () => {
    const gf = frame({ ts: 123, gesture: 'Open_Palm', score: 0.9, palmFacing: false });
    expect(toFrameInput(gf)).toMatchObject({
      ts: 123,
      present: true,
      gesture: 'Open_Palm',
      score: 0.9,
      velocity: { vx: 0, vy: 0 },
      palmFacing: false,
    });
  });

  it('attaches the SW-supplied hover id and dwell flag', () => {
    const gf = frame({ ts: 5, gesture: 'Pointing_Up', score: 0.9 });
    expect(toFrameInput(gf, { hoverId: 17, dwellEnabled: true })).toMatchObject({
      hoverId: 17,
      dwellEnabled: true,
    });
  });
});

describe('createFrameConsumer', () => {
  it('drives Open_Palm-hold -> Arm, then a fast Closed_Fist -> Scroll, persisting the transition log', () => {
    const intents: Intent[] = [];
    const persisted: TransitionLogEntry[] = [];
    const consumer = createFrameConsumer({
      dispatch: (intent) => intents.push(intent),
      persist: (entries) => {
        persisted.push(...entries);
      },
    });

    // Open_Palm held >= PALM_CLUTCH_MS (1000ms) AND for the 3-frame confidence
    // vote clutches Paused -> Armed.
    consumer.push(frame({ ts: 0, gesture: 'Open_Palm', score: 0.9 }));
    consumer.push(frame({ ts: 500, gesture: 'Open_Palm', score: 0.9 }));
    consumer.push(frame({ ts: 1000, gesture: 'Open_Palm', score: 0.9 }));
    // A confidently-held Closed_Fist with fast vertical motion scrolls once it too
    // clears the 3-frame vote (the first two fist frames are suppressed).
    consumer.push(frame({ ts: 1033, gesture: 'Closed_Fist', score: 0.9, velocity: { vx: 0, vy: -0.05 } }));
    consumer.push(frame({ ts: 1066, gesture: 'Closed_Fist', score: 0.9, velocity: { vx: 0, vy: -0.05 } }));
    consumer.push(frame({ ts: 1100, gesture: 'Closed_Fist', score: 0.9, velocity: { vx: 0, vy: -0.05 } }));

    // Intents are unchanged by the 1C pointer wiring: clutch to Arm, then the
    // 3-frame fist vote scrolls. (With pointer now forwarded, the machine passes
    // through Armed.Pointing between fist frames — more transition-log entries —
    // but the Arm and Scroll entries still bracket the log.)
    expect(intents).toEqual([{ type: 'Arm' }, { type: 'Scroll', dy: -20 }]);

    expect(persisted[0]).toMatchObject({ from: 'Paused', to: 'Armed.Idle', intent: { type: 'Arm' } });
    expect(persisted.at(-1)).toMatchObject({
      to: 'Armed.Scrolling',
      intent: { type: 'Scroll', dy: -20 },
    });
  });

  it('emits nothing and persists nothing for a frame that changes neither state nor intent', () => {
    const intents: Intent[] = [];
    const persisted: TransitionLogEntry[] = [];
    const consumer = createFrameConsumer({
      dispatch: (intent) => intents.push(intent),
      persist: (entries) => {
        persisted.push(...entries);
      },
    });

    consumer.push(frame({ ts: 0, present: false }));

    expect(intents).toEqual([]);
    expect(persisted).toEqual([]);
  });
});
