import type { StageTimings } from '@gesture/protocol';

// Rolling-window per-stage timing accumulator for the diagnostics signal
// (milestone 1D.5). Pure, mirroring fps-logger.ts: no timers, no globals — the
// worker feeds it the per-stage `performance.now()` deltas of each inferred
// frame and a `drop()` for each read frame it skips, then asks for the
// median-per-stage over the trailing window plus the dropped-frame count at
// window close. This is measurement only, not gesture-timing logic (that stays
// in gesture-core, CLAUDE.md §2 / .claude/rules/offscreen.md).

/** One inferred frame's per-stage cost; the five keys of the protocol StageTimings. */
export type StageMarks = StageTimings;

const STAGE_KEYS = [
  'captureMs',
  'inferMs',
  'normalizeMs',
  'classifyMs',
  'filterMs',
] as const;

/** Median of a non-empty list (mean of the two middle values for an even count). */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/** Per-stage median across a non-empty list of marks (each stage independently). */
export function medianStages(marks: readonly StageMarks[]): StageTimings {
  const out = {} as StageTimings;
  for (const key of STAGE_KEYS) out[key] = median(marks.map((m) => m[key]));
  return out;
}

interface Entry {
  ts: number;
  marks: StageMarks;
}

/**
 * Stateful wrapper the worker uses: `record()` an inferred frame's stage costs,
 * `drop()` a skipped frame, `sample()` at window close. `sample` prunes marks
 * that have fallen out of the trailing window `(now - windowMs, now]` (marks
 * arrive monotonically) so memory stays bounded, returns the per-stage median
 * over the window (or `undefined` when the window is empty), and resets the
 * dropped counter for the next window.
 */
export class StageTimer {
  private entries: Entry[] = [];
  private droppedCount = 0;

  constructor(private readonly windowMs: number) {}

  record(ts: number, marks: StageMarks): void {
    this.entries.push({ ts, marks });
  }

  drop(): void {
    this.droppedCount++;
  }

  sample(now: number): { stages: StageTimings | undefined; dropped: number } {
    const from = now - this.windowMs;
    let cut = 0;
    while (cut < this.entries.length && this.entries[cut]!.ts <= from) cut++;
    if (cut > 0) this.entries.splice(0, cut);

    const stages =
      this.entries.length > 0
        ? medianStages(this.entries.map((e) => e.marks))
        : undefined;
    const dropped = this.droppedCount;
    this.droppedCount = 0;
    return { stages, dropped };
  }
}
