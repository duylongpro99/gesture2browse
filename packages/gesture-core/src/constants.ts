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
