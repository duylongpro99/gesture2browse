import { describe, it, expect } from 'vitest';
import {
  FalsePositiveEntrySchema,
  FrameSampleSchema,
  type GestureFrame,
} from '@gesture/protocol';
import {
  DiagnosticsRecorder,
  appendBounded,
  toFixtureFrame,
  toFrameSample,
  parseFlagFalsePositive,
} from '../entrypoints/background/diagnostics';

const frame = (over: Partial<GestureFrame> = {}): GestureFrame => ({
  ts: 0,
  present: true,
  gesture: 'Closed_Fist',
  score: 0.9,
  pinch: 0.1,
  fingers: [false, false, false, false, false],
  velocity: { vx: 1, vy: 2 },
  scale: 0.3,
  pointer: { x: 0.5, y: 0.5 },
  ...over,
});

const flatLandmarks = (n: number): number[] => Array.from({ length: 63 }, (_, i) => n + i);

describe('toFrameSample', () => {
  it('keeps features and drops landmarks; validates as FrameSample', () => {
    const s = toFrameSample(frame({ ts: 5, landmarks: flatLandmarks(0) }));
    expect(FrameSampleSchema.parse(s)).toEqual({
      ts: 5,
      present: true,
      gesture: 'Closed_Fist',
      score: 0.9,
      pinch: 0.1,
      velocity: { vx: 1, vy: 2 },
    });
    expect('landmarks' in s).toBe(false);
  });

  it('omits pinch (and gesture) when no hand is present', () => {
    const s = toFrameSample(frame({ present: false, gesture: undefined, pinch: 0 }));
    expect(s.pinch).toBeUndefined();
    expect(s.gesture).toBeUndefined();
    expect(FrameSampleSchema.safeParse(s).success).toBe(true);
  });
});

describe('toFixtureFrame', () => {
  it('returns a FixtureFrame only when landmarks are present', () => {
    expect(toFixtureFrame(frame())).toBeNull();
    const fx = toFixtureFrame(frame({ ts: 7, landmarks: flatLandmarks(0) }));
    expect(fx).toEqual({ ts: 7, present: true, landmarks: flatLandmarks(0), score: 0.9 });
  });
});

describe('appendBounded', () => {
  it('drops the oldest beyond max', () => {
    const s: number[] = [];
    for (let i = 0; i < 5; i++) appendBounded(s, i, 3);
    expect(s).toEqual([2, 3, 4]);
  });
});

describe('DiagnosticsRecorder', () => {
  it('keeps a bounded feature window over all frames', () => {
    const rec = new DiagnosticsRecorder(2, 2);
    rec.observe(frame({ ts: 1 }));
    rec.observe(frame({ ts: 2 }));
    rec.observe(frame({ ts: 3 }));
    expect(rec.frameWindow().map((f) => f.ts)).toEqual([2, 3]);
  });

  it('builds an entry with a feature window and no landmark window when disarmed', () => {
    const rec = new DiagnosticsRecorder();
    rec.observe(frame({ ts: 1 }));
    rec.observe(frame({ ts: 2 }));
    const entry = rec.buildFalsePositive({ ts: 100, eventTs: 2, note: 'ghost pinch' });
    expect(entry.frameWindow.map((f) => f.ts)).toEqual([1, 2]);
    expect(entry.landmarkWindow).toBeUndefined();
    expect(entry.note).toBe('ghost pinch');
    expect(FalsePositiveEntrySchema.parse(entry)).toEqual(entry);
  });

  it('includes a bounded landmark window when frames carried landmarks (armed)', () => {
    const rec = new DiagnosticsRecorder(10, 2);
    rec.observe(frame({ ts: 1, landmarks: flatLandmarks(1) }));
    rec.observe(frame({ ts: 2, landmarks: flatLandmarks(2) }));
    rec.observe(frame({ ts: 3, landmarks: flatLandmarks(3) }));
    const entry = rec.buildFalsePositive({ ts: 100, eventTs: 3 });
    expect(entry.frameWindow.map((f) => f.ts)).toEqual([1, 2, 3]);
    expect(entry.landmarkWindow?.map((f) => f.ts)).toEqual([2, 3]); // bounded to 2
    expect(entry.note).toBeUndefined();
    expect(FalsePositiveEntrySchema.parse(entry)).toEqual(entry);
  });

  it('carries the last transition when supplied', () => {
    const rec = new DiagnosticsRecorder();
    rec.observe(frame({ ts: 1 }));
    const transition = { ts: 1, from: 'Idle', to: 'Armed', event: 'present' };
    const entry = rec.buildFalsePositive({ ts: 2, eventTs: 1, transition });
    expect(entry.transition).toEqual(transition);
    expect(FalsePositiveEntrySchema.parse(entry)).toEqual(entry);
  });

  it('snapshots windows (later frames do not mutate a built entry)', () => {
    const rec = new DiagnosticsRecorder();
    rec.observe(frame({ ts: 1 }));
    const entry = rec.buildFalsePositive({ ts: 2, eventTs: 1 });
    rec.observe(frame({ ts: 2 }));
    expect(entry.frameWindow.map((f) => f.ts)).toEqual([1]);
  });
});

describe('parseFlagFalsePositive', () => {
  it('accepts a minimal flag and carries optional fields', () => {
    expect(parseFlagFalsePositive({ type: 'FlagFalsePositive' })).toEqual({});
    expect(parseFlagFalsePositive({ type: 'FlagFalsePositive', eventTs: 5, note: 'x' })).toEqual({
      eventTs: 5,
      note: 'x',
    });
  });

  it('rejects non-matching or malformed messages', () => {
    expect(parseFlagFalsePositive({ type: 'nope' })).toBeNull();
    expect(parseFlagFalsePositive(null)).toBeNull();
    expect(parseFlagFalsePositive('FlagFalsePositive')).toBeNull();
  });

  it('drops fields of the wrong type', () => {
    expect(
      parseFlagFalsePositive({ type: 'FlagFalsePositive', eventTs: '5', note: 7 }),
    ).toEqual({});
  });
});
