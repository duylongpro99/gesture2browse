import { createGestureRunner, type FrameInput } from '@gesture/gesture-core';
import type { GestureFrame, Intent, TransitionLogEntry } from '@gesture/protocol';

// Adapts a validated GestureFrame into the gesture-core FSM (Task 5, 1A
// vertical slice). All gesture-timing logic lives in gesture-core
// (CLAUDE.md §2) — this module only maps fields and forwards the runner's
// per-frame delta to injected dependencies, so it is driveable in vitest with
// no chrome.*/browser globals (docs/sdd/1A-vertical-slice/task-5-brief.md).

// GestureFrame (protocol) is a superset of FrameInput (gesture-core); take
// just the subset fields the FSM consumes.
export function toFrameInput(frame: GestureFrame): FrameInput {
  return {
    ts: frame.ts,
    present: frame.present,
    gesture: frame.gesture,
    score: frame.score,
    velocity: frame.velocity,
  };
}

export interface FrameConsumerDeps {
  dispatch(intent: Intent): void;
  persist(entries: TransitionLogEntry[]): void | Promise<void>;
}

export interface FrameConsumer {
  push(frame: GestureFrame): void;
}

// Drives one gesture-core runner across the lifetime of the service worker,
// forwarding each frame's emitted intents to `dispatch` and its transition
// log entries to `persist`. The runner itself returns only that frame's
// delta (0-1 intents, 0-1 transitions) — this is the one place that consumes
// the delta stream; nothing here re-accumulates history beyond what
// `persist` chooses to keep.
export function createFrameConsumer(deps: FrameConsumerDeps): FrameConsumer {
  const runner = createGestureRunner();

  return {
    push(frame: GestureFrame): void {
      const { intents, transitions } = runner.send(toFrameInput(frame));
      for (const intent of intents) deps.dispatch(intent);
      if (transitions.length > 0) void deps.persist(transitions);
    },
  };
}
