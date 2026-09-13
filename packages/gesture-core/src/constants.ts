// Gesture timing / threshold constants. These are the ONLY place such values live;
// the FSM (machine.ts) reads them and no other component decides gesture timing
// (CLAUDE.md §2, gesture-core.md). Values are v0 placeholders tuned via fixture replay.

// Open_Palm held this long clutches Armed<->Paused.
export const PALM_CLUTCH_MS = 1000;
// Vertical hand travel (normalized units) per frame that counts as a scroll step.
export const SCROLL_STEP = 0.02;
// Classifier score below this is treated as no confident gesture.
export const MIN_CONFIDENCE = 0.5;
// vy (normalized units/s) -> CSS px conversion for Scroll.dy. v0 placeholder;
// this is a fixture-tunable (retune via fixture replay), not a plan constant.
export const SCROLL_PX_PER_UNIT = 400;
// Confidence-vote window: a gesture label must be classified for this many
// CONSECUTIVE frames before the FSM lets it fire (arm/scroll), so a single
// transient/edge-pose frame cannot trigger an action. Fixture-tunable — retune
// via the golden replay suite (replay-golden.test.ts, Exit E2).
export const VOTE_FRAMES = 3;

// --- 1C: full Armed.* gesture timing / hysteresis / cooldowns ---
// All values are v0/G6-MOCK placeholders tuned via replay; still the ONLY place
// gesture timing lives (CLAUDE.md §2). Timing is derived from FrameInput.ts deltas
// inside the machine (the clutch pattern), never from wall-clock timers, so the
// fixture/scripted replay is deterministic.

// Stable-tracking gate: no gesture fires until the hand has been continuously
// present for this long (guards against a firing on the frame a hand (re)appears).
export const STABLE_TRACK_MS = 300;

// Pinch hysteresis: pinch distance below PINCH_IN enters the pinched region,
// above PINCH_OUT leaves it (PINCH_IN < PINCH_OUT prevents flicker).
export const PINCH_IN = 0.25;
export const PINCH_OUT = 0.35;
// A pinch held shorter than this (then released) is a tap → Click; held at least
// this long → DragStart.
export const TAP_MAX_MS = 300;

// Dwell click (Accessibility profile, dwellEnabled): pointer held within
// DWELL_RADIUS of the same interactable for DWELL_MS → Click. Movement resets it.
export const DWELL_MS = 600;
export const DWELL_RADIUS = 0.02;

// Hold gestures: a confident pose held for its HOLD_*_MS → HoldGesture{kind}.
export const HOLD_VICTORY_MS = 600;
export const HOLD_THUMB_MS = 800;

// Cooldowns after a hold / swipe fires, blocking an immediate re-fire.
export const COOLDOWN_HOLD_MS = 1000;
export const COOLDOWN_SWIPE_MS = 800;

// Swipe: lateral velocity over SWIPE_V_MIN with accumulated displacement over
// SWIPE_D_MIN (normalized) → Swipe{dir}.
export const SWIPE_V_MIN = 1.5;
export const SWIPE_D_MIN = 0.25;

// Scroll inertia: after a fist releases WHILE the hand stays present, the residual
// scroll velocity decays by SCROLL_INERTIA_DECAY each SCROLL_INERTIA_TICK_MS of
// elapsed frame time, emitting decaying Scroll intents until |dy| drops below
// SCROLL_INERTIA_MIN_DY (CSS px). The dispatcher applies NO decay (single owner).
export const SCROLL_INERTIA_TICK_MS = 50;
export const SCROLL_INERTIA_DECAY = 0.85;
export const SCROLL_INERTIA_MIN_DY = 2;
