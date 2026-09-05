import { describe, it, expect } from 'vitest';
import {
  GestureFrameSchema,
  FixtureRecordSchema,
  IntentSchema,
  BenchRowSchema,
  BENCH_COLUMNS,
  GestureLabel,
  PumpStatSchema,
  CameraGrantStatusSchema,
} from '@gesture/protocol';

describe('GestureFrame v0', () => {
  it('parses a minimal frame', () => {
    const f = {
      ts: 1,
      present: true,
      score: 0.9,
      pinch: 0.2,
      fingers: [true, false, false, false, false],
      velocity: { vx: 0, vy: 0 },
      scale: 0.3,
      pointer: { x: 0.5, y: 0.5 },
    };
    expect(GestureFrameSchema.parse(f).present).toBe(true);
  });
  it('rejects a wrong-length fingers tuple', () => {
    expect(() =>
      GestureFrameSchema.parse({
        ts: 1,
        present: true,
        score: 1,
        pinch: 0,
        fingers: [true],
        velocity: { vx: 0, vy: 0 },
        scale: 0,
        pointer: { x: 0, y: 0 },
      }),
    ).toThrow();
  });
});

describe('FixtureRecord', () => {
  it('parses a one-frame record and requires 63-length landmarks', () => {
    const rec = {
      schema: 'gesture-fixture/v0',
      meta: {
        subjectId: 's1',
        gestureLabel: 'none',
        distanceM: 1.0,
        palmOrientation: 'toward',
        handedness: 'Right',
        fps: 30,
        recordedAt: '2026-09-04T00:00:00Z',
      },
      frames: [{ ts: 0, present: true, landmarks: Array(63).fill(0) }],
    };
    expect(FixtureRecordSchema.parse(rec).frames.length).toBe(1);
    const bad = { ...rec, frames: [{ ts: 0, present: true, landmarks: Array(60).fill(0) }] };
    expect(() => FixtureRecordSchema.parse(bad)).toThrow();
  });
});

describe('Intent v0', () => {
  it('parses Arm/Pause/Scroll', () => {
    expect(IntentSchema.parse({ type: 'Arm' }).type).toBe('Arm');
    expect(IntentSchema.parse({ type: 'Scroll', dy: 12 }).type).toBe('Scroll');
  });
});

describe('Bench schema', () => {
  it('BenchRow has exactly one field per BENCH_COLUMNS entry', () => {
    const row: Record<string, unknown> = {};
    for (const c of BENCH_COLUMNS) row[c] = typeof c === 'string' ? 0 : 0;
    row.device = 'm1';
    row.delegate = 'webgl';
    row.recognizer = 'handlandmarker';
    row.resolution = '480p';
    row.notes = '';
    const parsed = BenchRowSchema.parse(row);
    expect(Object.keys(parsed).sort()).toEqual([...BENCH_COLUMNS].sort());
  });
});

it('GestureLabel includes the mandatory none class', () => {
  expect(GestureLabel.options).toContain('none');
});

describe('PumpStat (G1 frame-pump telemetry)', () => {
  const sample = {
    ts: 12_345,
    fps: 29.7,
    frames: 891,
    windowMs: 30_000,
    delegate: 'webgl',
    hidden: true,
  };
  it('accepts a valid sample', () => {
    expect(PumpStatSchema.parse(sample).fps).toBe(29.7);
  });
  it('rejects a bad delegate', () => {
    expect(() => PumpStatSchema.parse({ ...sample, delegate: 'GPU' })).toThrow();
  });
  it('rejects a missing field', () => {
    const { hidden: _omit, ...missing } = sample;
    expect(() => PumpStatSchema.parse(missing)).toThrow();
  });
});

describe('CameraGrantStatus (G2 camera-grant join message)', () => {
  const sample = {
    ts: 1_725_000_000_000,
    state: 'granted',
    persistent: true,
    source: 'grant-page',
  };
  it('accepts a valid record', () => {
    expect(CameraGrantStatusSchema.parse(sample).state).toBe('granted');
  });
  it('rejects a bad state', () => {
    expect(() => CameraGrantStatusSchema.parse({ ...sample, state: 'allow' })).toThrow();
  });
  it('rejects a bad source', () => {
    expect(() => CameraGrantStatusSchema.parse({ ...sample, source: 'offscreen' })).toThrow();
  });
  it('rejects a missing field', () => {
    const { persistent: _omit, ...missing } = sample;
    expect(() => CameraGrantStatusSchema.parse(missing)).toThrow();
  });
});
