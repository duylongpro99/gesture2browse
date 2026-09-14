import { describe, expect, it } from 'vitest';
import {
  DiagnosticsConfigSchema,
  DiagnosticsExportSchema,
  FalsePositiveEntrySchema,
  FrameSampleSchema,
  PumpStatSchema,
  StageTimingsSchema,
} from '../src/index.js';

const pumpBase = {
  ts: 1000,
  fps: 30,
  frames: 60,
  windowMs: 2000,
  delegate: 'webgl' as const,
  hidden: true,
};

const stages = {
  captureMs: 1,
  inferMs: 12,
  normalizeMs: 0.2,
  classifyMs: 1,
  filterMs: 0.1,
};

const sample = {
  ts: 1234,
  present: true,
  gesture: 'Closed_Fist' as const,
  score: 0.72,
  pinch: 0.4,
  velocity: { vx: 0, vy: 0.1 },
};

describe('StageTimings', () => {
  it('round-trips the five stage timers', () => {
    expect(StageTimingsSchema.parse(stages)).toEqual(stages);
  });
});

describe('PumpStat additive extension', () => {
  it('accepts stages + dropped', () => {
    const parsed = PumpStatSchema.parse({ ...pumpBase, stages, dropped: 2 });
    expect(parsed.stages?.inferMs).toBe(12);
    expect(parsed.dropped).toBe(2);
  });

  it('stays additive: a bare 0B PumpStat still parses', () => {
    const parsed = PumpStatSchema.parse(pumpBase);
    expect(parsed.stages).toBeUndefined();
    expect(parsed.dropped).toBeUndefined();
  });

  it('rejects a negative or fractional dropped count', () => {
    expect(() => PumpStatSchema.parse({ ...pumpBase, dropped: -1 })).toThrow();
    expect(() => PumpStatSchema.parse({ ...pumpBase, dropped: 1.5 })).toThrow();
  });
});

describe('FrameSample', () => {
  it('is a feature-only slice (no landmarks)', () => {
    const parsed = FrameSampleSchema.parse(sample);
    expect(parsed.pinch).toBe(0.4);
    expect('landmarks' in parsed).toBe(false);
  });

  it('allows an absent hand (no gesture, pinch optional)', () => {
    const parsed = FrameSampleSchema.parse({
      ts: 1,
      present: false,
      score: 0,
      velocity: { vx: 0, vy: 0 },
    });
    expect(parsed.present).toBe(false);
    expect(parsed.gesture).toBeUndefined();
  });
});

describe('FalsePositiveEntry', () => {
  it('requires the always-present feature window', () => {
    expect(() =>
      FalsePositiveEntrySchema.parse({ ts: 5000, eventTs: 1234 }),
    ).toThrow();
  });

  it('carries a landmark window only when present', () => {
    const entry = FalsePositiveEntrySchema.parse({
      ts: 5000,
      eventTs: 1234,
      frameWindow: [sample],
      landmarkWindow: [
        { ts: 1234, present: true, landmarks: Array(63).fill(0), score: 0.72 },
      ],
    });
    expect(entry.landmarkWindow?.[0]?.landmarks).toHaveLength(63);
  });
});

describe('DiagnosticsConfig', () => {
  it('carries the record-landmarks toggle', () => {
    expect(
      DiagnosticsConfigSchema.parse({ recordLandmarks: false }).recordLandmarks,
    ).toBe(false);
  });
});

describe('DiagnosticsExport', () => {
  it('round-trips a full export blob', () => {
    const parsed = DiagnosticsExportSchema.parse({
      schema: 'gesture-diagnostics/v0',
      exportedAt: '2026-09-14T00:00:00.000Z',
      fps: [{ ...pumpBase, stages, dropped: 0 }],
      transitions: [
        { ts: 1234, from: 'Armed.Idle', to: 'Armed.Scrolling', event: 'FRAME' },
      ],
      falsePositives: [{ ts: 5000, eventTs: 1234, frameWindow: [sample] }],
      config: { recordLandmarks: false },
    });
    expect(parsed.schema).toBe('gesture-diagnostics/v0');
    expect(parsed.fps).toHaveLength(1);
  });

  it('rejects a wrong schema tag', () => {
    expect(() =>
      DiagnosticsExportSchema.parse({
        schema: 'gesture-diagnostics/v1',
        exportedAt: '2026-09-14T00:00:00.000Z',
        fps: [],
        transitions: [],
        falsePositives: [],
        config: { recordLandmarks: false },
      }),
    ).toThrow();
  });
});
