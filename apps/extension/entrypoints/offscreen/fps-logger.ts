// Rolling-window fps accumulator for the G1 frame pump (milestone 0B). Pure:
// no timers, no rAF, no globals — the worker feeds it a monotonic mark per
// delivered frame and asks for the fps over the trailing window. Keeping this a
// plain function/class (no `performance.now()` inside) makes the window math
// unit-testable and keeps timing out of any Chrome-only surface.

export interface FpsWindow {
  /** Frames counted in the trailing window ending at the sample time. */
  frames: number;
  /** Window length in ms. */
  windowMs: number;
  /** frames / (windowMs / 1000). */
  fps: number;
}

/**
 * fps over the window `(now - windowMs, now]`. A mark exactly at the trailing
 * edge (`now - windowMs`) is excluded; a mark exactly at `now` is included.
 * With no marks in the window the result is 0 fps (empty window).
 */
export function windowFps(
  marks: readonly number[],
  now: number,
  windowMs: number,
): FpsWindow {
  const from = now - windowMs;
  let frames = 0;
  for (const m of marks) {
    if (m > from && m <= now) frames++;
  }
  return { frames, windowMs, fps: frames / (windowMs / 1000) };
}

/**
 * Stateful wrapper the worker uses: `mark()` each delivered frame, `sample()`
 * at window close. `sample` prunes marks that have fallen out of the trailing
 * window (marks arrive monotonically), so memory stays bounded over a long run.
 */
export class FpsLogger {
  private marks: number[] = [];

  constructor(private readonly windowMs: number) {}

  mark(ts: number): void {
    this.marks.push(ts);
  }

  sample(now: number): FpsWindow {
    const from = now - this.windowMs;
    let drop = 0;
    while (drop < this.marks.length && this.marks[drop]! <= from) drop++;
    if (drop > 0) this.marks.splice(0, drop);
    return windowFps(this.marks, now, this.windowMs);
  }
}
