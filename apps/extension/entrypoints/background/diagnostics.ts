import type {
  FalsePositiveEntry,
  FixtureFrame,
  FrameSample,
  GestureFrame,
  TransitionLogEntry,
} from '@gesture/protocol';

// Service-worker diagnostics recorder (milestone 1D.5, Task 4). Pure: no chrome.*
// and no browser globals (background.ts injects storage and does the I/O), so the
// ring math and the false-positive builder are unit-testable. It keeps two
// bounded rolling windows over the GestureFrames the SW already receives on the
// offscreen Port:
//   - a FrameSample window (features only, ALWAYS) — FSM-level replay (Q2);
//   - a FixtureFrame window (raw landmarks, only on frames that carry them, i.e.
//     while record-landmarks is armed, Q3=C) — full-pipeline replay.
// On an owner "flag as false positive" it snapshots both windows into a
// FalsePositiveEntry. No gesture-timing logic lives here (single owner is
// gesture-core, CLAUDE.md §2); the window sizes below are recording bounds.

/** Frames of feature history kept for the always-present FSM-replay window. */
export const DEFAULT_FRAME_WINDOW = 120;
/** Frames of raw-landmark history kept for the (armed-only) full-pipeline window. */
export const DEFAULT_LANDMARK_WINDOW = 120;
/** Bound on the persisted false-positive session series. */
export const DEFAULT_MAX_FALSE_POSITIVES = 200;

/** GestureFrame -> FrameSample (features only; no landmarks). */
export function toFrameSample(frame: GestureFrame): FrameSample {
  return {
    ts: frame.ts,
    present: frame.present,
    score: frame.score,
    velocity: { vx: frame.velocity.vx, vy: frame.velocity.vy },
    ...(frame.gesture !== undefined ? { gesture: frame.gesture } : {}),
    ...(frame.present ? { pinch: frame.pinch } : {}), // absent when no hand present
  };
}

/** GestureFrame -> FixtureFrame, or null when the frame carries no landmarks. */
export function toFixtureFrame(frame: GestureFrame): FixtureFrame | null {
  if (!frame.landmarks) return null;
  return {
    ts: frame.ts,
    present: frame.present,
    landmarks: frame.landmarks,
    score: frame.score,
  };
}

/** Append `entry` to `series` in place, dropping the oldest to stay within `max`. */
export function appendBounded<T>(series: T[], entry: T, max: number): T[] {
  series.push(entry);
  if (series.length > max) series.splice(0, series.length - max);
  return series;
}

/**
 * Inbound page->SW "flag as false positive" request, after validation. The
 * SW-side `DiagnosticsConfig` payload of SetRecordLandmarks is validated with the
 * protocol `DiagnosticsConfigSchema` in background.ts (the extension never imports
 * zod directly — Zod lives in `packages/protocol`); this envelope carries only
 * optional primitives, so a pure type-guard keeps it testable without a schema.
 */
export interface FlagFalsePositiveRequest {
  eventTs?: number;
  note?: string;
}

/** Validate a page->SW FlagFalsePositive message; null when it is not one. */
export function parseFlagFalsePositive(msg: unknown): FlagFalsePositiveRequest | null {
  if (typeof msg !== 'object' || msg === null) return null;
  const m = msg as { type?: unknown; eventTs?: unknown; note?: unknown };
  if (m.type !== 'FlagFalsePositive') return null;
  const req: FlagFalsePositiveRequest = {};
  if (typeof m.eventTs === 'number') req.eventTs = m.eventTs;
  if (typeof m.note === 'string') req.note = m.note;
  return req;
}

/** Everything `buildFalsePositive` needs beyond the recorder's own windows. */
export interface FalsePositiveInput {
  /** When the owner flagged it (performance.now()). */
  ts: number;
  /** The ts of the event being flagged. */
  eventTs: number;
  note?: string;
  transition?: TransitionLogEntry;
}

export class DiagnosticsRecorder {
  private frames: FrameSample[] = [];
  private landmarks: FixtureFrame[] = [];

  constructor(
    private readonly frameWindowSize: number = DEFAULT_FRAME_WINDOW,
    private readonly landmarkWindowSize: number = DEFAULT_LANDMARK_WINDOW,
  ) {}

  /** Record one received GestureFrame into the rolling windows. */
  observe(frame: GestureFrame): void {
    appendBounded(this.frames, toFrameSample(frame), this.frameWindowSize);
    const fixture = toFixtureFrame(frame);
    if (fixture) appendBounded(this.landmarks, fixture, this.landmarkWindowSize);
  }

  /** Current feature window, oldest-first (read-only; also used to default eventTs). */
  frameWindow(): readonly FrameSample[] {
    return this.frames;
  }

  /**
   * Snapshot the current windows into a FalsePositiveEntry. The feature window is
   * always present; the landmark window is included only when record-landmarks was
   * armed (frames carried landmarks).
   */
  buildFalsePositive(input: FalsePositiveInput): FalsePositiveEntry {
    return {
      ts: input.ts,
      eventTs: input.eventTs,
      frameWindow: [...this.frames],
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.transition ? { transition: input.transition } : {}),
      ...(this.landmarks.length > 0 ? { landmarkWindow: [...this.landmarks] } : {}),
    };
  }
}
