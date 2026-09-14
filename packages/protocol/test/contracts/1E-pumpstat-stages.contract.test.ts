// CONTRACT (frozen at plan time, milestone 1D.5). Consumer: 1E (perf CI reads
// per-stage timings for regression thresholds from the Phase-0 bench; §4.5).
// Asserts what a per-stage-timing consumer needs from the extended PumpStat,
// through the @gesture/protocol public export: the diagnostics producer emits a
// per-stage breakdown (capture/infer/normalize/classify/filter) plus a
// dropped-frame count, and the extension stays ADDITIVE so every 0B producer
// (fps only) remains valid. Fails until execute (impl Task 1). Execute must NOT
// edit this file.
import { describe, it, expect } from 'vitest';
import { PumpStatSchema, StageTimingsSchema } from '@gesture/protocol';

const base = {
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

describe('contract: PumpStat per-stage timings + dropped frames (1E)', () => {
  it('names the five per-stage timers the bench vocabulary uses', () => {
    // Perf CI joins live stage timings against the BenchRow columns of the same
    // name, so the StageTimings keys must match exactly.
    const parsed = StageTimingsSchema.parse(stages);
    expect(Object.keys(parsed).sort()).toEqual(
      ['captureMs', 'classifyMs', 'filterMs', 'inferMs', 'normalizeMs'].sort(),
    );
  });

  it('carries stages + a dropped-frame count on a PumpStat window', () => {
    const parsed = PumpStatSchema.parse({ ...base, stages, dropped: 2 });
    expect(parsed.stages?.inferMs).toBe(12);
    expect(parsed.dropped).toBe(2);
  });

  it('stays additive: a bare 0B PumpStat (fps only, no stages/dropped) still parses', () => {
    const parsed = PumpStatSchema.parse(base);
    expect(parsed.stages).toBeUndefined();
    expect(parsed.dropped).toBeUndefined();
  });

  it('rejects a negative dropped-frame count', () => {
    expect(() => PumpStatSchema.parse({ ...base, dropped: -1 })).toThrow();
  });
});
