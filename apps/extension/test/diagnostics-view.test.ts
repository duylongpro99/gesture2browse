import { describe, it, expect } from 'vitest';
import type { FalsePositiveEntry, PumpStat, StageTimings } from '@gesture/protocol';
import {
  formatDropped,
  formatFalsePositive,
  formatFps,
  formatTransition,
  stageRows,
} from '../entrypoints/diagnostics/view';

const stat: PumpStat = {
  ts: 1,
  fps: 29.97,
  frames: 30,
  windowMs: 1000,
  delegate: 'webgl',
  hidden: true,
  dropped: 3,
  stages: { captureMs: 1.2, inferMs: 8.4, normalizeMs: 0.3, classifyMs: 0.5, filterMs: 0.1 },
};

describe('diagnostics view formatters', () => {
  it('formats fps and dropped, with placeholders when absent', () => {
    expect(formatFps(stat)).toBe('30.0 fps');
    expect(formatFps(undefined)).toBe('— fps');
    expect(formatDropped(stat)).toBe('dropped: 3');
    expect(formatDropped(undefined)).toBe('dropped: —');
    const noDrop: PumpStat = { ...stat, dropped: undefined };
    expect(formatDropped(noDrop)).toBe('dropped: —');
  });

  it('produces one labeled stage row per stage, empty when no timings', () => {
    const rows = stageRows(stat.stages as StageTimings);
    expect(rows.map((r) => r.label)).toEqual(['capture', 'infer', 'normalize', 'classify', 'filter']);
    expect(rows[1]).toEqual({ label: 'infer', ms: '8.4 ms' });
    expect(stageRows(undefined)).toEqual([]);
  });

  it('formats a transition with and without an intent', () => {
    expect(formatTransition({ ts: 0, from: 'idle', to: 'armed', event: 'FRAME' })).toBe(
      'idle → armed (FRAME)',
    );
    expect(
      formatTransition({ ts: 0, from: 'armed', to: 'armed', event: 'FRAME', intent: { type: 'Scroll', dy: 5 } }),
    ).toBe('armed → armed (FRAME) → Scroll');
  });

  it('formats a false positive, noting note and landmark window when present', () => {
    const base: FalsePositiveEntry = {
      ts: 5000,
      eventTs: 1234,
      frameWindow: [
        { ts: 1234, present: true, score: 0.7, velocity: { vx: 0, vy: 0 } },
        { ts: 1267, present: true, score: 0.7, velocity: { vx: 0, vy: 0 } },
      ],
    };
    expect(formatFalsePositive(base)).toBe('@1234 (2 frames)');
    expect(
      formatFalsePositive({
        ...base,
        note: 'twitch',
        landmarkWindow: [{ ts: 1234, present: true, landmarks: Array(63).fill(0), score: 0.7 }],
      }),
    ).toBe('@1234 (2 frames) [1 landmark frames] — twitch');
  });
});
