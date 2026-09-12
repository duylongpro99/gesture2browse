import { createGestureRunner, type FrameInput } from '@gesture/gesture-core';
import type { GestureFrame, Intent, TransitionLogEntry } from '@gesture/protocol';

// Adapts a validated GestureFrame into the gesture-core FSM (1A Task 5; extended
// in 1C). All gesture-timing logic lives in gesture-core (CLAUDE.md §2) — this
// module only maps fields and forwards the runner's per-frame delta to injected
// dependencies, so it is driveable in vitest with no chrome.*/browser globals.

// GestureFrame (protocol) is a superset of FrameInput (gesture-core); take the
// subset fields the FSM consumes, plus the 1C page-side inputs the SW supplies:
// `hoverId` (the snapped interactable under the pointer, from PageEvent.hover)
// and `dwellEnabled` (the active profile's dwell-click flag). `pinch`/`pointer`
// ride on every GestureFrame already.
export function toFrameInput(
  frame: GestureFrame,
  page: { hoverId?: number | null; dwellEnabled?: boolean } = {},
): FrameInput {
  return {
    ts: frame.ts,
    present: frame.present,
    gesture: frame.gesture,
    score: frame.score,
    velocity: frame.velocity,
    palmFacing: frame.palmFacing,
    pinch: frame.pinch,
    pointer: frame.pointer,
    hoverId: page.hoverId,
    dwellEnabled: page.dwellEnabled,
  };
}

export interface FrameConsumerDeps {
  dispatch(intent: Intent): void;
  persist(entries: TransitionLogEntry[]): void | Promise<void>;
  /** Last hover id the content script reported for the active tab (default null). */
  hover?(): number | null;
  /** Whether dwell-click is on for the active profile (default false). */
  dwellEnabled?(): boolean;
  /** Forward the pointer to the content overlay each frame (ADR 0001). */
  relay?(frame: GestureFrame, fsmState: string): void;
}

export interface FrameConsumer {
  push(frame: GestureFrame): void;
}

// Drives one gesture-core runner across the lifetime of the service worker.
// Each frame: build the FrameInput (with the page-side hover/dwell inputs), send
// it, track the current FSM state from the transition delta, relay the pointer,
// then forward emitted intents and any transition log entry. The runner returns
// only that frame's delta; nothing here re-accumulates history beyond `persist`.
export function createFrameConsumer(deps: FrameConsumerDeps): FrameConsumer {
  const runner = createGestureRunner();
  let fsmState = 'Paused'; // machine's initial state

  return {
    push(frame: GestureFrame): void {
      const input = toFrameInput(frame, {
        hoverId: deps.hover?.() ?? null,
        dwellEnabled: deps.dwellEnabled?.() ?? false,
      });
      const { intents, transitions } = runner.send(input);
      if (transitions.length > 0) {
        const last = transitions[transitions.length - 1];
        if (last) fsmState = last.to;
      }
      deps.relay?.(frame, fsmState);
      for (const intent of intents) deps.dispatch(intent);
      if (transitions.length > 0) void deps.persist(transitions);
    },
  };
}
