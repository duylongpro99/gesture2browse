// CONTRACT (frozen at plan time, milestone 0A). Consumers: 0B, 0D, 1A.
// Asserts what a fixture consumer (1A replay; 0B/0D tooling) reads from the
// fixture record shape, through the @gesture/protocol public export only.
// Fails until execute (impl Task 2) implements the schemas. Execute must NOT edit this file.
import { describe, it, expect } from 'vitest';
import { FixtureRecordSchema, GestureLabel } from '@gesture/protocol';

const canonical = {
  schema: 'gesture-fixture/v0',
  meta: {
    subjectId: 'synthetic',
    gestureLabel: 'Closed_Fist',
    distanceM: 1.0,
    palmOrientation: 'toward',
    handedness: 'Right',
    fps: 30,
    source: 'placeholder.y4m',
    recordedAt: '2026-09-04T00:00:00Z',
  },
  frames: [
    { ts: 0, present: false },
    { ts: 33, present: true, landmarks: Array(63).fill(0.1), worldLandmarks: Array(63).fill(0.2), score: 0.9 },
  ],
};

describe('contract: fixture record shape (0B, 0D, 1A)', () => {
  it('parses a canonical raw-landmark fixture', () => {
    const rec = FixtureRecordSchema.parse(canonical);
    expect(rec.schema).toBe('gesture-fixture/v0');
    expect(rec.frames).toHaveLength(2);
  });

  it('exposes raw image-normalized landmarks of length 63 per present frame', () => {
    const rec = FixtureRecordSchema.parse(canonical);
    const present = rec.frames.find((f) => f.present)!;
    expect(present.landmarks).toHaveLength(63);
  });

  it('keeps worldLandmarks available as an optional secondary signal', () => {
    const rec = FixtureRecordSchema.parse(canonical);
    const present = rec.frames.find((f) => f.present)!;
    expect(present.worldLandmarks).toHaveLength(63);
  });

  it('carries the labelling metadata a consumer needs (label incl. none, distance, orientation)', () => {
    const rec = FixtureRecordSchema.parse(canonical);
    expect(GestureLabel.options).toContain(rec.meta.gestureLabel);
    expect(GestureLabel.options).toContain('none');
    expect([0.5, 1.0, 1.5]).toContain(rec.meta.distanceM);
    expect(['toward', 'away']).toContain(rec.meta.palmOrientation);
  });

  it('rejects a landmark array that is not 21×3 = 63', () => {
    const bad = { ...canonical, frames: [{ ts: 0, present: true, landmarks: Array(60).fill(0) }] };
    expect(() => FixtureRecordSchema.parse(bad)).toThrow();
  });

  it('round-trips through JSON without loss', () => {
    const rec = FixtureRecordSchema.parse(canonical);
    expect(FixtureRecordSchema.parse(JSON.parse(JSON.stringify(rec)))).toEqual(rec);
  });
});
