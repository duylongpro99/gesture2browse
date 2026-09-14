import type { GestureFrame } from '@gesture/protocol';
import {
  normalizeLandmarks,
  OneEuroFilter,
  pinchDistance,
  fingerExtension,
  KnnClassifier,
  createLandmarkFilter,
  palmFacing,
  type Classifier,
} from '@gesture/gesture-core';

// Composes gesture-core's pure perception pieces into a per-frame GestureFrame:
// landmark filter (per-point 1€ smoothing on 0,4,8,9) -> normalize -> 1€ filter
// (pointer smoothing) -> features -> classifier -> palmFacing. Pure module: no
// DOM/chrome.* here (offscreen.md / gesture-core.md boundaries). ALL gesture
// timing (hold/cooldown/hysteresis) lives in gesture-core's FSM, not here —
// this file only derives the instantaneous per-frame observation. The
// classifier is injected (defaults to KnnClassifier) so the worker can pass a
// trained MlpClassifier without this module knowing about fetch/network.

// 1€ filter cutoffs below are perception-smoothing parameters (remove per-frame
// jitter in the derived pointer position); they are NOT gesture-timing constants
// (those live in gesture-core/constants.ts and its state machine).
const POINTER_FILTER_OPTS = { minCutoff: 1.0, beta: 0.007, dCutoff: 1.0 };

const WRIST = 0;
const MIDDLE_MCP = 9;
const INDEX_TIP = 8;

function point(l: number[], i: number): [number, number] {
  const b = i * 3;
  return [l[b] ?? 0, l[b + 1] ?? 0];
}

/**
 * Per-frame timings of the three derivation sub-stages, filled in place when an
 * out-param is passed to `next` (diagnostics stage-timing, milestone 1D.5;
 * measurement only, not gesture-timing logic). `filterMs` = 1€ smoothing of the
 * landmarks and pointer; `normalizeMs` = normalize + feature derivation;
 * `classifyMs` = the classifier. Kept here (not in the worker) so the numbers are
 * an honest split of what this module actually does.
 */
export interface DeriveTimings {
  normalizeMs: number;
  classifyMs: number;
  filterMs: number;
}

/** Source of GestureFrames for one tracked hand; holds cross-frame filter/velocity state. */
export interface GestureFrameSource {
  /**
   * `landmarks` is the flat [x,y,z]*21 array for the one hand, or null when no
   * hand is present. When `timings` is passed it is filled with the per-stage
   * `performance.now()` deltas for this frame.
   */
  next(landmarks: number[] | null, ts: number, timings?: DeriveTimings): GestureFrame;
}

export function createGestureFrameSource(classifier: Classifier = new KnnClassifier()): GestureFrameSource {
  const filterX = new OneEuroFilter(POINTER_FILTER_OPTS);
  const filterY = new OneEuroFilter(POINTER_FILTER_OPTS);
  const landmarkFilter = createLandmarkFilter();

  let prevPointer = { x: 0, y: 0 };
  let prevTs: number | null = null;

  return {
    next(landmarks: number[] | null, ts: number, timings?: DeriveTimings): GestureFrame {
      if (!landmarks) {
        if (timings) {
          timings.filterMs = 0;
          timings.normalizeMs = 0;
          timings.classifyMs = 0;
        }
        const frame: GestureFrame = {
          ts,
          present: false,
          gesture: 'none',
          score: 0,
          pinch: 0,
          fingers: [false, false, false, false, false],
          velocity: { vx: 0, vy: 0 },
          scale: 0,
          pointer: prevPointer,
        };
        prevTs = ts;
        return frame;
      }

      // Per-point 1€ smoothing on the wrist/thumb-tip/index-tip/middle-MCP
      // landmarks before anything else derives from them (normalize, features,
      // classify, palmFacing all read the filtered landmarks).
      const filterStart = performance.now();
      const filtered = landmarkFilter.next(landmarks, ts);

      // Pointer = index-tip (landmark 8), in MediaPipe's normalized image space
      // ([0,1]^2), 1€-filtered to remove per-frame jitter (calibrated active-box
      // mapping to viewport is a later phase; arch §3.1).
      const [rawX, rawY] = point(filtered, INDEX_TIP);
      const x = filterX.filter(rawX, ts);
      const y = filterY.filter(rawY, ts);
      const filterMs = performance.now() - filterStart;

      const dtMs = prevTs !== null ? Math.max(ts - prevTs, 1) : null;
      const vx = dtMs !== null ? (x - prevPointer.x) / (dtMs / 1000) : 0;
      const vy = dtMs !== null ? (y - prevPointer.y) / (dtMs / 1000) : 0;

      const normalizeStart = performance.now();
      const normalized = normalizeLandmarks(filtered);
      const pinch = pinchDistance(normalized);
      const fingers = fingerExtension(normalized);
      const facing = palmFacing(filtered);
      const normalizeMs = performance.now() - normalizeStart;

      const classifyStart = performance.now();
      const { label, score } = classifier.classify(normalized);
      const classifyMs = performance.now() - classifyStart;

      if (timings) {
        timings.filterMs = filterMs;
        timings.normalizeMs = normalizeMs;
        timings.classifyMs = classifyMs;
      }

      // Hand-span (wrist -> middle-MCP) in raw image space, used as the bbox scale.
      const [wx, wy] = point(filtered, WRIST);
      const [mx, my] = point(filtered, MIDDLE_MCP);
      const scale = Math.hypot(mx - wx, my - wy);

      const pointer = { x, y };
      prevPointer = pointer;
      prevTs = ts;

      return {
        ts,
        present: true,
        gesture: label,
        score,
        pinch,
        fingers,
        velocity: { vx, vy },
        scale,
        pointer,
        palmFacing: facing,
      };
    },
  };
}
