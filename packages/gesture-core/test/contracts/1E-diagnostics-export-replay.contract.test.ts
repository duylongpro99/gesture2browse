// CONTRACT (frozen at plan time, milestone 1D.5). Consumer: 1E (the owner's
// offline threshold-tuning loop, §4.6: "JSON export ... replayable against
// fixtures"). Asserts what that consumer needs from DiagnosticsExport, through
// the @gesture/gesture-core public export: a flagged false-positive entry
// converts into the existing replay inputs so the owner can re-run it against the
// FSM (feature window, always) and — when record-landmarks was armed — against the
// full perception pipeline (raw-landmark window). Fails until execute (impl Task 5)
// adds framesFromDiagnostics / fixtureFromDiagnostics. Execute must NOT edit this file.
import { describe, it, expect } from 'vitest';
import type { FalsePositiveEntry } from '@gesture/protocol';
import {
  framesFromDiagnostics,
  fixtureFromDiagnostics,
  replayFrames,
  replayFixture,
} from '@gesture/gesture-core';

const featureEntry: FalsePositiveEntry = {
  ts: 5000,
  eventTs: 1234,
  frameWindow: [
    { ts: 1234, present: true, gesture: 'Closed_Fist', score: 0.72, velocity: { vx: 0, vy: 0.1 } },
    { ts: 1267, present: true, gesture: 'Closed_Fist', score: 0.71, velocity: { vx: 0, vy: 0.1 } },
  ],
};

const landmarkEntry: FalsePositiveEntry = {
  ...featureEntry,
  landmarkWindow: [
    { ts: 1234, present: true, landmarks: Array(63).fill(0.1), score: 0.72 },
    { ts: 1267, present: true, landmarks: Array(63).fill(0.1), score: 0.71 },
  ],
};

describe('contract: DiagnosticsExport replay conversion (1E)', () => {
  it('converts the always-present feature window into FSM replay input', () => {
    const frames = framesFromDiagnostics(featureEntry);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ ts: 1234, present: true, gesture: 'Closed_Fist' });
    // The result is exactly what replayFrames consumes (FSM-level replay).
    expect(() => replayFrames(frames)).not.toThrow();
  });

  it('yields a valid FixtureRecord only when a landmark window is present (Q3=C armed)', () => {
    const fixture = fixtureFromDiagnostics(landmarkEntry);
    expect(fixture).not.toBeNull();
    // A real FixtureRecord the full-pipeline replay accepts.
    expect(fixture?.schema).toBe('gesture-fixture/v0');
    expect(fixture?.frames[0]?.landmarks).toHaveLength(63);
    expect(() => replayFixture(fixture!)).not.toThrow();
  });

  it('returns null for the FSM-only case (no landmark window)', () => {
    expect(fixtureFromDiagnostics(featureEntry)).toBeNull();
  });
});
