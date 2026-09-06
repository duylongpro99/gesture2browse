import type { GestureFrame } from '@gesture/protocol';
import { normalizeLandmarks, OneEuroFilter, pinchDistance, fingerExtension, KnnClassifier } from '@gesture/gesture-core';

// Composes gesture-core's pure perception pieces into a per-frame GestureFrame:
// normalize -> 1€ filter (pointer smoothing) -> features -> classifier. Pure
// module: no DOM/chrome.* here (offscreen.md / gesture-core.md boundaries).
// ALL gesture timing (hold/cooldown/hysteresis) lives in gesture-core's FSM, not
// here — this file only derives the instantaneous per-frame observation.

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

/** Source of GestureFrames for one tracked hand; holds cross-frame filter/velocity state. */
export interface GestureFrameSource {
  /** `landmarks` is the flat [x,y,z]*21 array for the one hand, or null when no hand is present. */
  next(landmarks: number[] | null, ts: number): GestureFrame;
}

export function createGestureFrameSource(): GestureFrameSource {
  const filterX = new OneEuroFilter(POINTER_FILTER_OPTS);
  const filterY = new OneEuroFilter(POINTER_FILTER_OPTS);
  const classifier = new KnnClassifier();

  let prevPointer = { x: 0, y: 0 };
  let prevTs: number | null = null;

  return {
    next(landmarks: number[] | null, ts: number): GestureFrame {
      if (!landmarks) {
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

      // Pointer = index-tip (landmark 8), in MediaPipe's normalized image space
      // ([0,1]^2), 1€-filtered to remove per-frame jitter (calibrated active-box
      // mapping to viewport is a later phase; arch §3.1).
      const [rawX, rawY] = point(landmarks, INDEX_TIP);
      const x = filterX.filter(rawX, ts);
      const y = filterY.filter(rawY, ts);

      const dtMs = prevTs !== null ? Math.max(ts - prevTs, 1) : null;
      const vx = dtMs !== null ? (x - prevPointer.x) / (dtMs / 1000) : 0;
      const vy = dtMs !== null ? (y - prevPointer.y) / (dtMs / 1000) : 0;

      const normalized = normalizeLandmarks(landmarks);
      const pinch = pinchDistance(normalized);
      const fingers = fingerExtension(normalized);
      const { label, score } = classifier.classify(normalized);

      // Hand-span (wrist -> middle-MCP) in raw image space, used as the bbox scale.
      const [wx, wy] = point(landmarks, WRIST);
      const [mx, my] = point(landmarks, MIDDLE_MCP);
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
      };
    },
  };
}
