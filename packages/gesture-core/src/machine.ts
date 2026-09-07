import { setup, assign, emit } from 'xstate';
import type { Intent } from '@gesture/protocol';
import { PALM_CLUTCH_MS, SCROLL_STEP, MIN_CONFIDENCE, SCROLL_PX_PER_UNIT, VOTE_FRAMES } from './constants.js';

// Per-frame perception result fed to the machine. Feature extraction happens
// upstream (normalize -> features -> classifier); ALL timing, hysteresis, cooldown,
// confidence gating AND the confidence vote happen here and nowhere else
// (CLAUDE.md §2). `palmFacing` is the per-frame geometric boolean computed offscreen
// (palm-facing gate); absent (undefined) = ungated, explicit false blocks firing.
export interface FrameInput {
  ts: number;
  present: boolean;
  gesture?: string;
  score: number;
  velocity: { vx: number; vy: number };
  palmFacing?: boolean;
}

type GestureEvent = { type: 'FRAME'; frame: FrameInput };

interface GestureContext {
  clutchStartTs: number | null;
  // Confidence vote: the label of the current consecutive run of confident
  // frames and how many frames it has lasted (through the PREVIOUS frame). A
  // guard on the current frame extends this via `voteCount()` before the vote
  // action commits it, so guards see the count INCLUDING the current frame.
  voteGesture: string | null;
  voteFrames: number;
}

// The classifier label of a frame, or null when the frame carries no confident
// gesture (absent, not present, 'none', or below the confidence floor).
function confidentGesture(f: FrameInput): string | null {
  if (!f.present || f.gesture === undefined || f.gesture === 'none') return null;
  return f.score >= MIN_CONFIDENCE ? f.gesture : null;
}

// Consecutive-frame count for THIS frame's confident gesture, extending the run
// recorded in context (or starting a fresh run of 1). 0 when not confident.
function voteCount(context: GestureContext, f: FrameInput): number {
  const g = confidentGesture(f);
  if (g === null) return 0;
  return context.voteGesture === g ? context.voteFrames + 1 : 1;
}

// A label has won the vote once it has been confidently held for VOTE_FRAMES
// consecutive frames (this frame included).
function voted(context: GestureContext, f: FrameInput, label: string): boolean {
  return confidentGesture(f) === label && voteCount(context, f) >= VOTE_FRAMES;
}

// Palm-facing gate: block firing only on an EXPLICIT palmFacing === false;
// undefined (older frames, the frozen 1C contract's frames) passes ungated.
function facingOk(f: FrameInput): boolean {
  return f.palmFacing !== false;
}

function palmConfident(f: FrameInput): boolean {
  return confidentGesture(f) === 'Open_Palm';
}

function fistConfident(f: FrameInput): boolean {
  return confidentGesture(f) === 'Closed_Fist';
}

// Fist no longer confidently held -> return Scrolling to Idle.
function fistReleased({ event }: { event: GestureEvent }): boolean {
  return !fistConfident(event.frame);
}

// Clutch held continuously for PALM_CLUTCH_MS, the palm has won the vote, and it
// is not gated out by an away-facing palm.
function clutchElapsed({ context, event }: { context: GestureContext; event: GestureEvent }): boolean {
  return (
    palmConfident(event.frame) &&
    context.clutchStartTs !== null &&
    event.frame.ts - context.clutchStartTs >= PALM_CLUTCH_MS &&
    voted(context, event.frame, 'Open_Palm') &&
    facingOk(event.frame)
  );
}

// Track (or clear) the palm-hold timer as frames arrive. Starts at the FIRST
// confident palm frame (so the clutch time is measured from the hold's start,
// independent of the vote); the vote gates only whether firing is allowed.
const trackClutch = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  clutchStartTs: ({ context, event }) =>
    palmConfident(event.frame) ? (context.clutchStartTs ?? event.frame.ts) : null,
});

const clearClutch = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  clutchStartTs: () => null,
});

// Advance the confidence vote for every frame the machine sees. Runs on ALL
// FRAME transitions so the consecutive-run count never desyncs.
const trackVote = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  voteGesture: ({ event }) => confidentGesture(event.frame),
  voteFrames: ({ context, event }) => voteCount(context, event.frame),
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
      shouldScroll: ({ context, event }: { context: GestureContext; event: GestureEvent }) =>
        fistConfident(event.frame) &&
        Math.abs(event.frame.velocity.vy) >= SCROLL_STEP &&
        voted(context, event.frame, 'Closed_Fist') &&
        facingOk(event.frame),
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
    context: { clutchStartTs: null, voteGesture: null, voteFrames: 0 },
    states: {
      Paused: {
        // Clear the clutch timer on entry, symmetric with Armed. Without this a
        // pause-while-held leaves a stale clutchStartTs, so clutchElapsed re-fires
        // on the very next palm frame and re-arms in 1 frame instead of a full
        // PALM_CLUTCH_MS hold (finding 1). The initial Paused entry is a no-op
        // (clutchStartTs already null).
        entry: clearClutch,
        on: {
          FRAME: [
            { guard: 'clutchElapsed', target: 'Armed', actions: [trackVote, 'emitArm'] },
            { actions: [trackVote, trackClutch] },
          ],
        },
      },
      Armed: {
        entry: clearClutch,
        initial: 'Idle',
        states: {
          Idle: {
            on: {
              FRAME: [{ guard: 'shouldScroll', target: 'Scrolling', actions: [trackVote, 'emitScroll'] }],
            },
          },
          Scrolling: {
            on: {
              FRAME: [
                { guard: 'shouldScroll', actions: [trackVote, 'emitScroll'] },
                { guard: 'fistReleased', target: 'Idle', actions: trackVote },
              ],
            },
          },
        },
        on: {
          FRAME: [
            { guard: 'clutchElapsed', target: 'Paused', actions: [trackVote, 'emitPause'] },
            { actions: [trackVote, trackClutch] },
          ],
        },
      },
    },
  });
}
