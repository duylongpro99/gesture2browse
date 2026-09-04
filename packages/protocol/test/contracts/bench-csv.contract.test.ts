// CONTRACT (frozen at plan time, milestone 0A). Consumers: 0B, 0D, 1A.
// Asserts what a bench-CSV consumer (0B fps logger; 0D dispatch survey output)
// needs from the bench CSV schema, through the @gesture/protocol public export.
// Fails until execute (impl Task 2) implements the schema. Execute must NOT edit this file.
import { describe, it, expect } from 'vitest';
import { BENCH_COLUMNS, BenchRowSchema } from '@gesture/protocol';

const row = {
  device: 'M1 Air',
  delegate: 'webgl',
  recognizer: 'handlandmarker',
  resolution: '480p',
  numHands: 1,
  frames: 300,
  durationMs: 10000,
  fpsMean: 30,
  fpsP50: 30,
  fpsP05: 24,
  captureMsP50: 1,
  inferMsP50: 12,
  normalizeMsP50: 0.2,
  classifyMsP50: 1,
  filterMsP50: 0.1,
  totalMsP50: 15,
  inferMsP95: 20,
  coldInitMs: 800,
  droppedFrames: 2,
  notes: 'placeholder run',
};

describe('contract: bench CSV schema (0B, 0D, 1A)', () => {
  it('fixes a stable, ordered column set for producers to write against', () => {
    // A logger reuses BENCH_COLUMNS as the header; assert the columns the roadmap
    // names (delegate switch, recognizer, resolution, fps, per-stage timers) are present.
    for (const c of ['device', 'delegate', 'recognizer', 'resolution', 'fpsP50', 'inferMsP50', 'coldInitMs']) {
      expect(BENCH_COLUMNS).toContain(c);
    }
  });

  it('has exactly one schema field per column', () => {
    const parsed = BenchRowSchema.parse(row);
    expect(Object.keys(parsed).sort()).toEqual([...BENCH_COLUMNS].sort());
  });

  it('constrains delegate / recognizer / resolution to the measured variants', () => {
    expect(() => BenchRowSchema.parse({ ...row, delegate: 'webgpu' })).toThrow();
    expect(() => BenchRowSchema.parse({ ...row, recognizer: 'handlandmarker' })).not.toThrow();
    expect(() => BenchRowSchema.parse({ ...row, resolution: '1080p' })).toThrow();
  });

  it('serializes to a CSV header line equal to the column order', () => {
    const header = BENCH_COLUMNS.join(',');
    expect(header.startsWith('device,delegate,recognizer,resolution')).toBe(true);
    expect(header.split(',')).toHaveLength(BENCH_COLUMNS.length);
  });
});
