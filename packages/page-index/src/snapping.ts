import { SNAP_NEIGHBOUR_MARGIN_PX, SNAP_RADIUS_PX, SNAP_SPEED_CUTOFF } from './constants.js';
import type { Bbox } from './grid.js';
import type { IndexEntry, InteractableIndex } from './interactable-index.js';

/** The snapped target: its id and the bbox centre the cursor renders at. */
export type SnapResult = { id: number; center: [number, number] } | null;

export interface Snapper {
  /**
   * Snap the pointer at (x, y) moving at `speed` (px per sample) to the nearest
   * interactable within the speed-scaled radius, with neighbour hysteresis.
   * Returns `null` when moving too fast or nothing is in range. While latched,
   * always returns the latched target.
   */
  snap(x: number, y: number, speed: number): SnapResult;
  /** Freeze the current target (pinch onset) until `release()`. */
  latch(): void;
  release(): void;
}

export interface SnapperOptions {
  radiusPx?: number;
  speedCutoff?: number;
  /** Neighbour-switch margin in px (see `SNAP_NEIGHBOUR_MARGIN_PX`). */
  neighbourMarginPx?: number;
}

function distToBbox(x: number, y: number, [bx, by, bw, bh]: Bbox): number {
  const dx = Math.max(bx - x, 0, x - (bx + bw));
  const dy = Math.max(by - y, 0, y - (by + bh));
  return Math.hypot(dx, dy);
}

function centerOf([bx, by, bw, bh]: Bbox): [number, number] {
  return [bx + bw / 2, by + bh / 2];
}

export function createSnapper(index: InteractableIndex, opts: SnapperOptions = {}): Snapper {
  const radiusPx = opts.radiusPx ?? SNAP_RADIUS_PX;
  const speedCutoff = opts.speedCutoff ?? SNAP_SPEED_CUTOFF;
  const neighbourMarginPx = opts.neighbourMarginPx ?? SNAP_NEIGHBOUR_MARGIN_PX;

  let current: SnapResult = null;
  let currentId: number | null = null;
  let latched = false;

  const snap = (x: number, y: number, speed: number): SnapResult => {
    if (latched && current) return current;

    const radius = speed > speedCutoff ? 0 : radiusPx;
    if (radius === 0) {
      current = null;
      currentId = null;
      return null;
    }

    const candidates = index.at(x, y, radius);
    if (candidates.length === 0) {
      current = null;
      currentId = null;
      return null;
    }

    const dist = (e: IndexEntry) => distToBbox(x, y, e.bbox);
    let best: IndexEntry | null = null;
    for (const e of candidates) if (best === null || dist(e) < dist(best)) best = e;
    if (best === null) return null; // unreachable: candidates is non-empty

    // Neighbour hysteresis: keep the current target unless a competitor beats it
    // by more than the neighbour-switch margin.
    if (currentId !== null) {
      const prev = candidates.find((e) => e.id === currentId);
      if (prev && dist(best) + neighbourMarginPx >= dist(prev)) best = prev;
    }

    currentId = best.id;
    current = { id: best.id, center: centerOf(best.bbox) };
    return current;
  };

  const latch = (): void => {
    latched = true;
  };
  const release = (): void => {
    latched = false;
  };

  return { snap, latch, release };
}
