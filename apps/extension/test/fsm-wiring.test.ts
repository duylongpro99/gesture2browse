import { describe, it, expect, vi } from 'vitest';
import type { GestureFrame, Intent, TransitionLogEntry } from '@gesture/protocol';
import { createFrameConsumer, toFrameInput } from '../entrypoints/background/fsm';

// Unit tests for the GestureFrame -> gesture-core FSM wiring (Task 5, 1A
// vertical slice). No chrome.*/browser globals — dispatch/persist are plain
// spies, per docs/sdd/1A-vertical-slice/task-5-brief.md.

function frame(overrides: Partial<GestureFrame>): GestureFrame {
  return {
    ts: 0,
    present: true,
    score: 0,
    pinch: 0,
    fingers: [false, false, false, false, false],
    velocity: { vx: 0, vy: 0 },
    scale: 1,
    pointer: { x: 0.5, y: 0.5 },
    ...overrides,
  };
}

describe('toFrameInput', () => {
  it('projects the GestureFrame subset the FSM consumes', () => {
    const gf = frame({ ts: 123, gesture: 'Open_Palm', score: 0.9, velocity: { vx: 1, vy: -2 } });
    expect(toFrameInput(gf)).toEqual({
      ts: 123,
      present: true,
      gesture: 'Open_Palm',
      score: 0.9,
      velocity: { vx: 1, vy: -2 },
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

    // Open_Palm held >= PALM_CLUTCH_MS (1000ms) clutches Paused -> Armed.
    consumer.push(frame({ ts: 0, gesture: 'Open_Palm', score: 0.9 }));
    consumer.push(frame({ ts: 1000, gesture: 'Open_Palm', score: 0.9 }));
    // A confidently-held Closed_Fist with fast vertical motion scrolls.
    consumer.push(frame({ ts: 1100, gesture: 'Closed_Fist', score: 0.9, velocity: { vx: 0, vy: -0.05 } }));

    expect(intents).toEqual([{ type: 'Arm' }, { type: 'Scroll', dy: -20 }]);

    expect(persisted).toHaveLength(2);
    expect(persisted[0]).toMatchObject({ from: 'Paused', to: 'Armed.Idle', intent: { type: 'Arm' } });
    expect(persisted[1]).toMatchObject({
      from: 'Armed.Idle',
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
