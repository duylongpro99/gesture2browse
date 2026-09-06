import { setup, assign, emit } from 'xstate';
import type { Intent } from '@gesture/protocol';
import { PALM_CLUTCH_MS, SCROLL_STEP, MIN_CONFIDENCE, SCROLL_PX_PER_UNIT } from './constants.js';

// Per-frame perception result fed to the machine. Feature extraction happens
// upstream (normalize -> features -> classifier); ALL timing, hysteresis, cooldown
// and confidence gating happen here and nowhere else (CLAUDE.md §2).
export interface FrameInput {
  ts: number;
  present: boolean;
  gesture?: string;
  score: number;
  velocity: { vx: number; vy: number };
}

type GestureEvent = { type: 'FRAME'; frame: FrameInput };

interface GestureContext {
  clutchStartTs: number | null;
}

function palmConfident(f: FrameInput): boolean {
  return f.present && f.gesture === 'Open_Palm' && f.score >= MIN_CONFIDENCE;
}

function fistConfident(f: FrameInput): boolean {
  return f.present && f.gesture === 'Closed_Fist' && f.score >= MIN_CONFIDENCE;
}

// Fist no longer confidently held -> return Scrolling to Idle.
function fistReleased({ event }: { event: GestureEvent }): boolean {
  return !fistConfident(event.frame);
}

// Clutch has been held continuously for PALM_CLUTCH_MS.
function clutchElapsed({ context, event }: { context: GestureContext; event: GestureEvent }): boolean {
  return (
    palmConfident(event.frame) &&
    context.clutchStartTs !== null &&
    event.frame.ts - context.clutchStartTs >= PALM_CLUTCH_MS
  );
}

// Track (or clear) the palm-hold timer as frames arrive.
const trackClutch = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  clutchStartTs: ({ context, event }) =>
    palmConfident(event.frame) ? (context.clutchStartTs ?? event.frame.ts) : null,
});

const clearClutch = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  clutchStartTs: () => null,
});

export function createGestureMachine() {
  return setup({
    types: {
      context: {} as GestureContext,
      events: {} as GestureEvent,
      emitted: {} as Intent,
    },
    guards: {
      clutchElapsed,
      fistReleased,
      shouldScroll: ({ event }: { event: GestureEvent }) =>
        fistConfident(event.frame) && Math.abs(event.frame.velocity.vy) >= SCROLL_STEP,
    },
    actions: {
      emitArm: emit({ type: 'Arm' } as Intent),
      emitPause: emit({ type: 'Pause' } as Intent),
      emitScroll: emit(({ event }: { event: GestureEvent }) => ({
        type: 'Scroll' as const,
        dy: Math.round(event.frame.velocity.vy * SCROLL_PX_PER_UNIT),
      })),
    },
  }).createMachine({
    id: 'gesture',
    initial: 'Paused',
    context: { clutchStartTs: null },
    states: {
      Paused: {
        on: {
          FRAME: [
            { guard: 'clutchElapsed', target: 'Armed', actions: 'emitArm' },
            { actions: trackClutch },
          ],
        },
      },
      Armed: {
        entry: clearClutch,
        initial: 'Idle',
        states: {
          Idle: {
            on: {
              FRAME: [{ guard: 'shouldScroll', target: 'Scrolling', actions: 'emitScroll' }],
            },
          },
          Scrolling: {
            on: {
              FRAME: [
                { guard: 'shouldScroll', actions: 'emitScroll' },
                { guard: 'fistReleased', target: 'Idle' },
              ],
            },
          },
        },
        on: {
          FRAME: [
            { guard: 'clutchElapsed', target: 'Paused', actions: 'emitPause' },
            { actions: trackClutch },
          ],
        },
      },
    },
  });
}
