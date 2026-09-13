import { setup, assign, emit } from 'xstate';
import type { Intent } from '@gesture/protocol';
import {
  PALM_CLUTCH_MS,
  SCROLL_STEP,
  MIN_CONFIDENCE,
  SCROLL_PX_PER_UNIT,
  VOTE_FRAMES,
  STABLE_TRACK_MS,
  PINCH_IN,
  PINCH_OUT,
  TAP_MAX_MS,
  DWELL_MS,
  DWELL_RADIUS,
  HOLD_VICTORY_MS,
  HOLD_THUMB_MS,
  COOLDOWN_HOLD_MS,
  COOLDOWN_SWIPE_MS,
  SWIPE_V_MIN,
  SWIPE_D_MIN,
  SCROLL_INERTIA_TICK_MS,
  SCROLL_INERTIA_DECAY,
  SCROLL_INERTIA_MIN_DY,
} from './constants.js';

// Per-frame perception result fed to the machine. Feature extraction happens
// upstream (normalize -> features -> classifier); ALL timing, hysteresis, cooldown,
// confidence gating AND the confidence vote happen here and nowhere else
// (CLAUDE.md §2). `palmFacing` is the per-frame geometric boolean computed offscreen
// (palm-facing gate); absent (undefined) = ungated, explicit false blocks firing.
// 1C additions (all optional, so 1A/1B frames still parse): `pinch` is the pinch
// distance (small = pinched), `pointer` the normalized cursor, `hoverId` the snapped
// interactable under it (or null), `dwellEnabled` the per-profile dwell-click flag —
// all merged in from the page plane by the service worker (Task 6).
export interface FrameInput {
  ts: number;
  present: boolean;
  gesture?: string;
  score: number;
  velocity: { vx: number; vy: number };
  palmFacing?: boolean;
  pinch?: number;
  pointer?: { x: number; y: number };
  hoverId?: number | null;
  dwellEnabled?: boolean;
}

type GestureEvent = { type: 'FRAME'; frame: FrameInput };

type HoldKind = 'Victory' | 'Thumb_Up' | 'Thumb_Down' | 'ILoveYou';
const HOLD_POSES = new Set<string>(['Victory', 'Thumb_Up', 'Thumb_Down', 'ILoveYou']);

interface GestureContext {
  clutchStartTs: number | null;
  // Confidence vote: the label of the current consecutive run of confident
  // frames and how many frames it has lasted (through the PREVIOUS frame). A
  // guard on the current frame extends this via `voteCount()` before the vote
  // action commits it, so guards see the count INCLUDING the current frame.
  voteGesture: string | null;
  voteFrames: number;
  // Stable-tracking gate: ts the hand has been continuously present since (null
  // when absent). Every firing transition requires STABLE_TRACK_MS of presence.
  presentSinceTs: number | null;
  // Hold: onset ts of the current confident hold-pose run, the pose being held,
  // and the ts until which a new hold is blocked (post-fire cooldown).
  holdPoseStartTs: number | null;
  holdKind: HoldKind | null;
  holdCooldownUntil: number;
  // Pinch: onset ts of the current pinch and the interactable latched at pinch-in.
  pinchStartTs: number | null;
  pinchHoverId: number;
  // Dwell: onset ts of the current dwell, the target being dwelled and the anchor
  // point the pointer must stay within DWELL_RADIUS of.
  dwellStartTs: number | null;
  dwellHoverId: number | null;
  dwellAnchor: { x: number; y: number } | null;
  // Swipe: accumulated lateral displacement, the previous swipe-frame ts (for dt)
  // and the post-fire cooldown deadline.
  swipeDx: number;
  swipePrevTs: number | null;
  swipeCooldownUntil: number;
  // Scroll inertia: residual scroll velocity (CSS px) and the previous scroll-frame
  // ts, decayed each tick after a fist releases while the hand stays present.
  inertiaDy: number;
  scrollPrevTs: number | null;
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

// The hand has been continuously present for the stable-tracking gate.
function stableTracked(context: GestureContext, f: FrameInput): boolean {
  return context.presentSinceTs !== null && f.ts - context.presentSinceTs >= STABLE_TRACK_MS;
}

function hasPointer(f: FrameInput): boolean {
  return f.pointer !== undefined;
}

// In the pinched region: entered below PINCH_IN, held (hysteresis) until above
// PINCH_OUT. `released` = no pinch data or above the release threshold.
function pinchReleased(f: FrameInput): boolean {
  return f.pinch === undefined || f.pinch > PINCH_OUT;
}

function holdTimeFor(kind: HoldKind): number {
  return kind === 'Victory' ? HOLD_VICTORY_MS : HOLD_THUMB_MS;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Residual scroll velocity after decaying context.inertiaDy over the frame gap.
function decayedDy(context: GestureContext, f: FrameInput): number {
  const dt = f.ts - (context.scrollPrevTs ?? f.ts);
  const ticks = Math.max(1, Math.round(dt / SCROLL_INERTIA_TICK_MS));
  return Math.round(context.inertiaDy * SCROLL_INERTIA_DECAY ** ticks);
}

// The dwell anchor still holds this frame (same enabled target within the radius).
function dwellHeld(context: GestureContext, f: FrameInput): boolean {
  return (
    f.dwellEnabled === true &&
    f.hoverId != null &&
    context.dwellHoverId === f.hoverId &&
    context.dwellAnchor != null &&
    f.pointer != null &&
    distance(f.pointer, context.dwellAnchor) <= DWELL_RADIUS
  );
}

// --- universal per-frame bookkeeping (runs on EVERY FRAME transition) ---
const trackFrame = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  voteGesture: ({ event }) => confidentGesture(event.frame),
  voteFrames: ({ context, event }) => voteCount(context, event.frame),
  presentSinceTs: ({ context, event }) =>
    event.frame.present ? (context.presentSinceTs ?? event.frame.ts) : null,
  holdPoseStartTs: ({ context, event }) => {
    const g = confidentGesture(event.frame);
    if (g === null || !HOLD_POSES.has(g)) return null;
    return context.voteGesture === g ? (context.holdPoseStartTs ?? event.frame.ts) : event.frame.ts;
  },
});

// Track (or clear) the palm-hold clutch timer as frames arrive. Starts at the FIRST
// confident palm frame; the vote gates only whether firing is allowed.
const trackClutch = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  clutchStartTs: ({ context, event }) =>
    palmConfident(event.frame) ? (context.clutchStartTs ?? event.frame.ts) : null,
});

const clearClutch = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  clutchStartTs: () => null,
});

const latchPinch = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  pinchStartTs: ({ event }) => event.frame.ts,
  pinchHoverId: ({ event }) => event.frame.hoverId ?? -1,
});

// Keep the dwell anchor while the pointer stays on the same target within the
// radius; otherwise reset it to the current target/point (movement resets dwell).
const refreshDwell = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  dwellStartTs: ({ context, event }) => (dwellHeld(context, event.frame) ? context.dwellStartTs : event.frame.ts),
  dwellHoverId: ({ event }) => event.frame.hoverId ?? null,
  dwellAnchor: ({ context, event }) =>
    dwellHeld(context, event.frame) ? context.dwellAnchor : (event.frame.pointer ?? null),
});

const startHold = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  holdKind: ({ event }) => confidentGesture(event.frame) as HoldKind,
});

const finishHold = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  holdKind: () => null,
  holdCooldownUntil: ({ event }) => event.frame.ts + COOLDOWN_HOLD_MS,
});

const clearHold = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  holdKind: () => null,
});

const initSwipe = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  swipeDx: () => 0,
  swipePrevTs: ({ event }) => event.frame.ts,
});

const accumulateSwipe = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  swipeDx: ({ context, event }) =>
    context.swipeDx + event.frame.velocity.vx * ((event.frame.ts - (context.swipePrevTs ?? event.frame.ts)) / 1000),
  swipePrevTs: ({ event }) => event.frame.ts,
});

const finishSwipe = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  swipeCooldownUntil: ({ event }) => event.frame.ts + COOLDOWN_SWIPE_MS,
});

// Remember the live scroll velocity so inertia can decay from it after release.
const seedInertia = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  inertiaDy: ({ event }) => Math.round(event.frame.velocity.vy * SCROLL_PX_PER_UNIT),
  scrollPrevTs: ({ event }) => event.frame.ts,
});

const decayInertia = assign<GestureContext, GestureEvent, undefined, GestureEvent, never>({
  inertiaDy: ({ context, event }) => decayedDy(context, event.frame),
  scrollPrevTs: ({ event }) => event.frame.ts,
});

export function createGestureMachine() {
  return setup({
    types: {
      context: {} as GestureContext,
      events: {} as GestureEvent,
      emitted: {} as Intent,
    },
    guards: {
      clutchElapsed: ({ context, event }) =>
        palmConfident(event.frame) &&
        context.clutchStartTs !== null &&
        event.frame.ts - context.clutchStartTs >= PALM_CLUTCH_MS &&
        voted(context, event.frame, 'Open_Palm') &&
        facingOk(event.frame),
      shouldScroll: ({ context, event }) =>
        fistConfident(event.frame) &&
        Math.abs(event.frame.velocity.vy) >= SCROLL_STEP &&
        voted(context, event.frame, 'Closed_Fist') &&
        facingOk(event.frame),
      inertiaContinues: ({ context, event }) =>
        event.frame.present &&
        !fistConfident(event.frame) &&
        Math.abs(decayedDy(context, event.frame)) >= SCROLL_INERTIA_MIN_DY,
      pinchStart: ({ context, event }) =>
        event.frame.pinch !== undefined &&
        event.frame.pinch < PINCH_IN &&
        stableTracked(context, event.frame) &&
        facingOk(event.frame),
      pinchHold: ({ context, event }) =>
        !pinchReleased(event.frame) &&
        event.frame.ts - (context.pinchStartTs ?? event.frame.ts) >= TAP_MAX_MS,
      pinchStillDown: ({ event }) => !pinchReleased(event.frame),
      tapClick: ({ context, event }) =>
        pinchReleased(event.frame) && event.frame.ts - (context.pinchStartTs ?? event.frame.ts) < TAP_MAX_MS,
      dragRelease: ({ event }) => pinchReleased(event.frame),
      dwellFires: ({ context, event }) =>
        dwellHeld(context, event.frame) &&
        event.frame.ts - (context.dwellStartTs ?? event.frame.ts) >= DWELL_MS &&
        stableTracked(context, event.frame),
      hasPointerHover: ({ event }) => hasPointer(event.frame),
      keepPointing: ({ event }) =>
        hasPointer(event.frame) && !palmConfident(event.frame) && !fistConfident(event.frame),
      holdStart: ({ context, event }) => {
        const g = confidentGesture(event.frame);
        return (
          g !== null &&
          HOLD_POSES.has(g) &&
          voted(context, event.frame, g) &&
          stableTracked(context, event.frame) &&
          facingOk(event.frame) &&
          event.frame.ts >= context.holdCooldownUntil
        );
      },
      holdFires: ({ context, event }) =>
        context.holdKind !== null &&
        confidentGesture(event.frame) === context.holdKind &&
        context.holdPoseStartTs !== null &&
        event.frame.ts - context.holdPoseStartTs >= holdTimeFor(context.holdKind),
      holdContinues: ({ context, event }) =>
        context.holdKind !== null && confidentGesture(event.frame) === context.holdKind,
      swipeStart: ({ context, event }) =>
        palmConfident(event.frame) &&
        voted(context, event.frame, 'Open_Palm') &&
        Math.abs(event.frame.velocity.vx) >= SWIPE_V_MIN &&
        stableTracked(context, event.frame) &&
        facingOk(event.frame) &&
        event.frame.ts >= context.swipeCooldownUntil,
      swipeFires: ({ context }) => Math.abs(context.swipeDx) >= SWIPE_D_MIN,
      swipeContinues: ({ event }) => palmConfident(event.frame),
    },
    actions: {
      emitArm: emit({ type: 'Arm' } as Intent),
      emitPause: emit({ type: 'Pause' } as Intent),
      emitScroll: emit(({ event }: { event: GestureEvent }) => ({
        type: 'Scroll' as const,
        dy: Math.round(event.frame.velocity.vy * SCROLL_PX_PER_UNIT),
      })),
      emitScrollInertia: emit(({ context, event }: { context: GestureContext; event: GestureEvent }) => ({
        type: 'Scroll' as const,
        dy: decayedDy(context, event.frame),
      })),
      emitClickPinch: emit(({ context }: { context: GestureContext }) => ({
        type: 'Click' as const,
        id: context.pinchHoverId,
      })),
      emitClickDwell: emit(({ context }: { context: GestureContext }) => ({
        type: 'Click' as const,
        id: context.dwellHoverId ?? -1,
      })),
      emitDragStart: emit(({ context }: { context: GestureContext }) => ({
        type: 'DragStart' as const,
        id: context.pinchHoverId,
      })),
      emitDragEnd: emit({ type: 'DragEnd' } as Intent),
      emitSwipe: emit(({ event }: { event: GestureEvent }) => ({
        type: 'Swipe' as const,
        dir: (event.frame.velocity.vx >= 0 ? 'right' : 'left') as 'left' | 'right',
      })),
      emitHold: emit(({ context }: { context: GestureContext }) => ({
        type: 'HoldGesture' as const,
        kind: context.holdKind as HoldKind,
      })),
    },
  }).createMachine({
    id: 'gesture',
    initial: 'Paused',
    context: {
      clutchStartTs: null,
      voteGesture: null,
      voteFrames: 0,
      presentSinceTs: null,
      holdPoseStartTs: null,
      holdKind: null,
      holdCooldownUntil: 0,
      pinchStartTs: null,
      pinchHoverId: -1,
      dwellStartTs: null,
      dwellHoverId: null,
      dwellAnchor: null,
      swipeDx: 0,
      swipePrevTs: null,
      swipeCooldownUntil: 0,
      inertiaDy: 0,
      scrollPrevTs: null,
    },
    states: {
      Paused: {
        // Clear the clutch timer on entry, symmetric with Armed (see finding 1):
        // a pause-while-held must not leave a stale clutchStartTs.
        entry: clearClutch,
        on: {
          FRAME: [
            { guard: 'clutchElapsed', target: 'Armed', actions: [trackFrame, 'emitArm'] },
            { actions: [trackFrame, trackClutch] },
          ],
        },
      },
      Armed: {
        entry: clearClutch,
        initial: 'Idle',
        states: {
          Idle: {
            on: {
              FRAME: [
                { guard: 'pinchStart', target: 'PinchDown', actions: [latchPinch, trackFrame] },
                { guard: 'holdStart', target: 'Hold', actions: [startHold, trackFrame] },
                { guard: 'swipeStart', target: 'SwipeArmed', actions: [initSwipe, trackFrame] },
                { guard: 'shouldScroll', target: 'Scrolling', actions: [seedInertia, 'emitScroll', trackFrame] },
                { guard: 'hasPointerHover', target: 'Pointing', actions: [refreshDwell, trackFrame] },
              ],
            },
          },
          Pointing: {
            on: {
              FRAME: [
                { guard: 'dwellFires', target: 'Idle', actions: ['emitClickDwell', trackFrame] },
                { guard: 'pinchStart', target: 'PinchDown', actions: [latchPinch, trackFrame] },
                { guard: 'holdStart', target: 'Hold', actions: [startHold, trackFrame] },
                { guard: 'swipeStart', target: 'SwipeArmed', actions: [initSwipe, trackFrame] },
                { guard: 'shouldScroll', target: 'Scrolling', actions: [seedInertia, 'emitScroll', trackFrame] },
                { guard: 'keepPointing', actions: [refreshDwell, trackFrame] },
                { target: 'Idle', actions: [trackFrame] },
              ],
            },
          },
          PinchDown: {
            on: {
              FRAME: [
                { guard: 'pinchHold', target: 'Dragging', actions: ['emitDragStart', trackFrame] },
                { guard: 'tapClick', target: 'Idle', actions: ['emitClickPinch', trackFrame] },
                { guard: 'pinchStillDown', actions: [trackFrame] },
                { target: 'Idle', actions: [trackFrame] },
              ],
            },
          },
          Dragging: {
            on: {
              FRAME: [
                { guard: 'dragRelease', target: 'Idle', actions: ['emitDragEnd', trackFrame] },
                { actions: [trackFrame] },
              ],
            },
          },
          Scrolling: {
            on: {
              FRAME: [
                { guard: 'shouldScroll', actions: [seedInertia, 'emitScroll', trackFrame] },
                { guard: 'inertiaContinues', actions: ['emitScrollInertia', decayInertia, trackFrame] },
                { target: 'Idle', actions: [trackFrame] },
              ],
            },
          },
          SwipeArmed: {
            on: {
              FRAME: [
                { guard: 'swipeFires', target: 'Idle', actions: ['emitSwipe', finishSwipe, trackFrame] },
                { guard: 'swipeContinues', actions: [accumulateSwipe, trackFrame] },
                { target: 'Idle', actions: [trackFrame] },
              ],
            },
          },
          Hold: {
            on: {
              FRAME: [
                { guard: 'holdFires', target: 'Idle', actions: ['emitHold', finishHold, trackFrame] },
                { guard: 'holdContinues', actions: [trackFrame] },
                { target: 'Idle', actions: [clearHold, trackFrame] },
              ],
            },
          },
        },
        on: {
          FRAME: [
            { guard: 'clutchElapsed', target: 'Paused', actions: [trackFrame, 'emitPause'] },
            { actions: [trackFrame, trackClutch] },
          ],
        },
      },
    },
  });
}
