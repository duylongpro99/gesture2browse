// Per-coordinate 1€ smoothing for the landmarks whose jitter matters most for
// gesture recognition: wrist(0), thumb-tip(4), index-tip(8), middle-MCP(9)
// (arch §3.1, tech-stack §4 defaults: min_cutoff 1.0 Hz, beta 0.007). Holds
// one OneEuroFilter per coordinate (4 points x 3 coords = 12 filters) across
// calls; all other landmarks pass through unchanged.
import { OneEuroFilter } from './one-euro.js';

const FILTERED_POINTS = [0, 4, 8, 9];
const DEFAULT_PARAMS = { minCutoff: 1.0, beta: 0.007, dCutoff: 1.0 };

export interface LandmarkFilter {
  next(landmarks: number[], ts: number): number[];
}

export function createLandmarkFilter(
  params: { minCutoff: number; beta: number; dCutoff: number } = DEFAULT_PARAMS,
): LandmarkFilter {
  // One filter per (point, coordinate) pair, created lazily on first use so
  // filter state only exists for coordinates actually present in the input.
  const filters = new Map<number, OneEuroFilter>();

  function filterFor(coordIndex: number): OneEuroFilter {
    let f = filters.get(coordIndex);
    if (f === undefined) {
      f = new OneEuroFilter(params);
      filters.set(coordIndex, f);
    }
    return f;
  }

  return {
    next(landmarks: number[], ts: number): number[] {
      const out = landmarks.slice();
      for (const point of FILTERED_POINTS) {
        const base = point * 3;
        for (let c = 0; c < 3; c++) {
          const idx = base + c;
          const raw = landmarks[idx];
          if (raw === undefined) continue;
          out[idx] = filterFor(idx).filter(raw, ts);
        }
      }
      return out;
    },
  };
}
