import { describe, it, expect } from 'vitest';
import { DiagnosticsExportSchema, type FalsePositiveEntry, type PumpStat } from '@gesture/protocol';
import { framesFromDiagnostics } from '@gesture/gesture-core';
import {
  buildDiagnosticsExport,
  DEFAULT_CONFIG,
  type DiagnosticsSnapshot,
  serializeExport,
} from '../entrypoints/diagnostics/export';

const stat: PumpStat = {
  ts: 1,
  fps: 30,
  frames: 30,
  windowMs: 1000,
  delegate: 'webgl',
  hidden: true,
  dropped: 0,
  stages: { captureMs: 1, inferMs: 8, normalizeMs: 0.3, classifyMs: 0.5, filterMs: 0.1 },
};

const fp: FalsePositiveEntry = {
  ts: 5000,
  eventTs: 1234,
  frameWindow: [
    { ts: 1234, present: true, gesture: 'Closed_Fist', score: 0.72, velocity: { vx: 0, vy: 0.1 } },
  ],
};

const snapshot: DiagnosticsSnapshot = {
  fps: [stat],
  transitions: [{ ts: 1234, from: 'idle', to: 'armed', event: 'FRAME' }],
  falsePositives: [fp],
  config: DEFAULT_CONFIG,
};

describe('buildDiagnosticsExport', () => {
  it('assembles a schema-valid DiagnosticsExport from a storage snapshot', () => {
    const exp = buildDiagnosticsExport(snapshot, '2026-09-14T00:00:00.000Z');
    expect(exp.schema).toBe('gesture-diagnostics/v0');
    expect(exp.exportedAt).toBe('2026-09-14T00:00:00.000Z');
    expect(exp.fps).toHaveLength(1);
    expect(exp.config).toEqual({ recordLandmarks: false });
    // Re-parse proves the download blob is always a valid export.
    expect(DiagnosticsExportSchema.safeParse(exp).success).toBe(true);
  });

  it('serializes to JSON that parses back through the schema', () => {
    const exp = buildDiagnosticsExport(snapshot, '2026-09-14T00:00:00.000Z');
    const json = serializeExport(exp);
    const round = DiagnosticsExportSchema.parse(JSON.parse(json));
    expect(round.falsePositives[0]!.eventTs).toBe(1234);
  });

  it('round-trips a false positive into the 1E replay helpers', () => {
    const exp = buildDiagnosticsExport(snapshot, '2026-09-14T00:00:00.000Z');
    const frames = framesFromDiagnostics(exp.falsePositives[0]!);
    expect(frames[0]).toMatchObject({ ts: 1234, present: true, gesture: 'Closed_Fist' });
  });

  it('rejects a malformed snapshot rather than downloading it', () => {
    const bad = { ...snapshot, fps: [{ ts: 1 }] as unknown as PumpStat[] };
    expect(() => buildDiagnosticsExport(bad, '2026-09-14T00:00:00.000Z')).toThrow();
  });
});
