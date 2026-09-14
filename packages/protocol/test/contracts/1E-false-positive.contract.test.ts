// CONTRACT (frozen at plan time, milestone 1D.5). Consumer: 1E (the owner
// study/tuning loop, §4.6 "diagnostics export"). Asserts what a false-positive
// consumer needs from FalsePositiveEntry, through the @gesture/protocol public
// export: an owner-annotated entry (Q2) that ALWAYS carries a GestureFrame-feature
// window for FSM-level replay, and OPTIONALLY a raw-landmark window for
// full-pipeline replay when record-landmarks was armed (Q3=C). Fails until execute
// (impl Task 1). Execute must NOT edit this file.
import { describe, it, expect } from 'vitest';
import {
  FalsePositiveEntrySchema,
  FrameSampleSchema,
  type FalsePositiveEntry,
} from '@gesture/protocol';

const sample = {
  ts: 1234,
  present: true,
  gesture: 'Closed_Fist' as const,
  score: 0.72,
  pinch: 0.4,
  velocity: { vx: 0, vy: 0.1 },
};

describe('contract: FalsePositiveEntry (1E)', () => {
  it('is an owner annotation of a specific past event (ts flagged + eventTs)', () => {
    const entry: FalsePositiveEntry = FalsePositiveEntrySchema.parse({
      ts: 5000,
      eventTs: 1234,
      note: 'fist fired while resting hand',
      transition: { ts: 1234, from: 'Armed.Idle', to: 'Armed.Scrolling', event: 'FRAME' },
      frameWindow: [sample],
    });
    expect(entry.eventTs).toBe(1234);
    expect(entry.note).toContain('resting');
  });

  it('ALWAYS carries a feature window (FSM-level replay), no landmarks required', () => {
    const entry = FalsePositiveEntrySchema.parse({
      ts: 5000,
      eventTs: 1234,
      frameWindow: [sample, { ...sample, ts: 1267 }],
    });
    expect(entry.frameWindow).toHaveLength(2);
    expect(entry.landmarkWindow).toBeUndefined();
    // The feature window is a GestureFrame-feature slice, not raw landmarks.
    expect(() => FrameSampleSchema.parse(sample)).not.toThrow();
  });

  it('carries a raw-landmark window only when record-landmarks was armed (Q3=C)', () => {
    const entry = FalsePositiveEntrySchema.parse({
      ts: 5000,
      eventTs: 1234,
      frameWindow: [sample],
      landmarkWindow: [{ ts: 1234, present: true, landmarks: Array(63).fill(0), score: 0.72 }],
    });
    expect(entry.landmarkWindow?.[0]?.landmarks).toHaveLength(63);
  });

  it('requires the always-present feature window', () => {
    expect(() => FalsePositiveEntrySchema.parse({ ts: 5000, eventTs: 1234 })).toThrow();
  });
});
