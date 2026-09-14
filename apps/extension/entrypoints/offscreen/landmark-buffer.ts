// Rolling raw-landmark ring buffer for the diagnostics record-landmarks path
// (milestone 1D.5, owner gate Q3=C, default OFF). Pure, mirroring fps-logger.ts
// and stage-timer.ts: no timers, no globals, no browser surface — the worker
// arms/disarms it from the SW-relayed `record` message and, while armed, pushes
// each inferred frame's flat [x,y,z]*21 landmarks and attaches the latest to the
// emitted GestureFrame.
//
// This is the arch §1/§6 recording exception that .claude/rules/offscreen.md
// already blesses ("landmarks … not persisted unless the user records custom
// gestures or opts into diagnostics"): raw landmarks are retained here ONLY while
// armed, the ring is bounded, and disarming clears it so nothing lingers in
// steady state. It holds NO gesture-timing logic (that stays in gesture-core,
// CLAUDE.md §2); the capacity below is a recording-buffer bound, not a
// gesture-timing constant. The offscreen document never persists — the SW
// assembles the stored landmark window from the streamed frames (Task 4).

/** Flat [x,y,z] * 21 = 63 landmark array for one hand (protocol GestureFrame.landmarks). */
export type FlatLandmarks = number[];

/**
 * Default rolling window size, in frames (~3 s at 30 fps). Bounds in-worker raw
 * landmark retention while armed; a recording-buffer size, not a gesture-timing
 * constant (those live in gesture-core).
 */
export const DEFAULT_LANDMARK_CAPACITY = 90;

export class LandmarkBuffer {
  private ring: FlatLandmarks[] = [];
  private armed = false;

  constructor(private readonly capacity: number = DEFAULT_LANDMARK_CAPACITY) {}

  /**
   * Arm or disarm recording. Disarming (and thus the disarmed steady state)
   * clears the ring so no landmarks linger once recording stops. Idempotent: a
   * redundant arm(true) must not wipe the frames recorded so far.
   */
  arm(on: boolean): void {
    if (on === this.armed) return;
    this.armed = on;
    if (!on) this.ring = [];
  }

  get isArmed(): boolean {
    return this.armed;
  }

  /** Record one frame's landmarks while armed; a no-op when disarmed. Bounded to capacity. */
  record(landmarks: FlatLandmarks): void {
    if (!this.armed) return;
    this.ring.push(landmarks);
    if (this.ring.length > this.capacity) {
      this.ring.splice(0, this.ring.length - this.capacity);
    }
  }

  /**
   * The most recent recorded landmarks — what the worker attaches to the emitted
   * GestureFrame while armed — or undefined when nothing has been recorded.
   */
  latest(): FlatLandmarks | undefined {
    return this.ring[this.ring.length - 1];
  }

  /** The rolling window, oldest-first (bounded to capacity). */
  window(): readonly FlatLandmarks[] {
    return this.ring;
  }
}
