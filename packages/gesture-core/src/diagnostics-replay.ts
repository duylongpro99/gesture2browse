import type { FalsePositiveEntry, FixtureRecord } from '@gesture/protocol';
import type { FrameInput } from './machine.js';

// DiagnosticsExport → replay conversion (milestone 1D.5, Task 5). Pure mapping of
// a flagged FalsePositiveEntry into the replay inputs 1E's offline tuning loop
// already consumes: the always-present feature window replays at FSM level
// (`replayFrames`), and — only when record-landmarks was armed (Q3=C) — the raw
// landmark window replays through the full perception pipeline (`replayFixture*`).
// No timing constant lives here; this is a shape adapter, not gesture logic.

// One FrameSample → one FrameInput. Optional feature fields are copied only when
// present, so absent `gesture`/`pinch` stay absent rather than becoming
// `undefined` members (the FSM treats missing and undefined the same, but the
// mapping stays faithful to the recorded sample).
export function framesFromDiagnostics(entry: FalsePositiveEntry): FrameInput[] {
  return entry.frameWindow.map((s) => {
    const frame: FrameInput = {
      ts: s.ts,
      present: s.present,
      score: s.score,
      velocity: { vx: s.velocity.vx, vy: s.velocity.vy },
    };
    if (s.gesture !== undefined) frame.gesture = s.gesture;
    if (s.pinch !== undefined) frame.pinch = s.pinch;
    return frame;
  });
}

// The raw-landmark window (recorded only while armed) → a FixtureRecord the
// full-pipeline replay accepts. Returns null when no landmark window was
// recorded (FSM-only case). The meta is synthesized: a diagnostics export does
// not know the true subject/label/geometry of a false positive, so the fields
// carry honest placeholders (label 'none'), with `fps` derived from the window's
// own timestamps when it has ≥2 frames. Meta is schema-valid but not used by the
// replay itself, which reads only `frames`.
export function fixtureFromDiagnostics(entry: FalsePositiveEntry): FixtureRecord | null {
  const frames = entry.landmarkWindow;
  if (frames === undefined || frames.length === 0) return null;
  return {
    schema: 'gesture-fixture/v0',
    meta: {
      subjectId: 'diagnostics',
      gestureLabel: 'none',
      distanceM: 1.0,
      palmOrientation: 'toward',
      handedness: 'Right',
      fps: fpsFromFrames(frames),
      source: 'diagnostics-export',
      recordedAt: new Date(0).toISOString(),
      notes: `false-positive flagged at ts=${entry.eventTs}`,
    },
    frames,
  };
}

// Median frame rate from consecutive timestamp deltas; falls back to 30 when the
// window is too short or the timestamps do not advance.
function fpsFromFrames(frames: FixtureRecord['frames']): number {
  const dts: number[] = [];
  let prev: number | null = null;
  for (const f of frames) {
    if (prev !== null && f.ts - prev > 0) dts.push(f.ts - prev);
    prev = f.ts;
  }
  if (dts.length === 0) return 30;
  dts.sort((a, b) => a - b);
  const median = dts[Math.floor(dts.length / 2)] ?? 0;
  return median > 0 ? Math.round(1000 / median) : 30;
}
