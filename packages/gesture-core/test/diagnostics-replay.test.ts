import { describe, it, expect } from 'vitest';
import { type FalsePositiveEntry, FixtureRecordSchema } from '@gesture/protocol';
import {
  framesFromDiagnostics,
  fixtureFromDiagnostics,
  replayFrames,
  replayFixture,
} from '@gesture/gesture-core';

const feature: FalsePositiveEntry = {
  ts: 5000,
  eventTs: 1234,
  frameWindow: [
    { ts: 1234, present: true, gesture: 'Closed_Fist', score: 0.72, pinch: 0.4, velocity: { vx: 0, vy: 0.1 } },
    { ts: 1267, present: false, score: 0, velocity: { vx: 0, vy: 0 } },
  ],
};

const withLandmarks: FalsePositiveEntry = {
  ...feature,
  landmarkWindow: [
    { ts: 1234, present: true, landmarks: Array(63).fill(0.1), score: 0.72 },
    { ts: 1267, present: true, landmarks: Array(63).fill(0.2), score: 0.71 },
  ],
};

describe('framesFromDiagnostics', () => {
  it('maps every FrameSample field onto a FrameInput', () => {
    const frames = framesFromDiagnostics(feature);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({
      ts: 1234,
      present: true,
      gesture: 'Closed_Fist',
      score: 0.72,
      pinch: 0.4,
      velocity: { vx: 0, vy: 0.1 },
    });
    // absent pinch stays absent (not merged in as undefined)
    expect('pinch' in frames[1]!).toBe(false);
    expect('gesture' in frames[1]!).toBe(false);
  });

  it('produces input replayFrames accepts', () => {
    expect(() => replayFrames(framesFromDiagnostics(feature))).not.toThrow();
  });
});

describe('fixtureFromDiagnostics', () => {
  it('returns null when no landmark window was recorded', () => {
    expect(fixtureFromDiagnostics(feature)).toBeNull();
  });

  it('builds a schema-valid FixtureRecord from the landmark window', () => {
    const fixture = fixtureFromDiagnostics(withLandmarks);
    expect(fixture).not.toBeNull();
    expect(fixture!.schema).toBe('gesture-fixture/v0');
    expect(fixture!.frames).toHaveLength(2);
    expect(fixture!.frames[0]!.landmarks).toHaveLength(63);
    expect(FixtureRecordSchema.safeParse(fixture).success).toBe(true);
    expect(() => replayFixture(fixture!)).not.toThrow();
  });

  it('returns null for an empty landmark window', () => {
    expect(fixtureFromDiagnostics({ ...feature, landmarkWindow: [] })).toBeNull();
  });
});
