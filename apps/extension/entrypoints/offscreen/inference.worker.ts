import type { Delegate, GestureFrame, StageTimings } from '@gesture/protocol';
import { KnnClassifier, type Classifier } from '@gesture/gesture-core';
import { createHandLandmarker, recreateHandLandmarker, reportFrameCostMs, type MediaPipeInit } from './mediapipe';
import { classifierFromWeights } from './classifier-select';
import { FpsLogger } from './fps-logger';
import { createGestureFrameSource, type DeriveTimings } from './gesture-frame';
import { StageTimer } from './stage-timer';
import { LandmarkBuffer } from './landmark-buffer';
import { shouldInfer, DEFAULT_FPS_POLICY_PARAMS, type FpsPolicyState } from './fps-policy';

// G1 inference worker. It consumes the transferred ReadableStream<VideoFrame>,
// draws each frame to an OffscreenCanvas, runs HandLandmarker.detectForVideo,
// and feeds the fps-logger. It is driven by the stream reader (frames pulled as
// the camera produces them) — no rAF, no setTimeout — so throughput survives a
// hidden document (02-architecture §1 "two loops, two speeds"). Video, frames,
// and landmarks never leave this worker: only the numeric window crosses back.

/** Offscreen document -> worker: start the pump on the transferred stream. */
export interface StartPump {
  type: 'start';
  stream: ReadableStream<VideoFrame>;
  wasmBase: string;
  modelUrl: string;
  /** Extension-origin URL for the trained MLP weights (models/gesture-mlp.json). */
  weightsUrl: string;
  windowMs: number;
  preferredDelegate: Delegate;
}

/**
 * Offscreen document -> worker: arm/disarm the rolling landmark buffer (1D.5
 * record-landmarks, relayed from the SW via main.ts). While armed the worker
 * attaches `landmarks` to each emitted GestureFrame (the recording exception in
 * .claude/rules/offscreen.md); disarmed, no landmarks cross the Port.
 */
export interface RecordMsg {
  type: 'record';
  on: boolean;
}

/** Everything main.ts can post to the worker. */
export type WorkerInMsg = StartPump | RecordMsg;

/** Worker -> offscreen document (intra-document; not the protocol boundary). */
export type WorkerMsg =
  | { type: 'ready'; delegate: Delegate }
  | { type: 'error'; error: string }
  | {
      type: 'stat';
      ts: number;
      fps: number;
      frames: number;
      windowMs: number;
      delegate: Delegate;
      stages?: StageTimings; // 1D.5: per-stage median over the window (undefined if empty)
      dropped: number; // 1D.5: frames read but not inferred within the window
    }
  | { type: 'frame'; frame: GestureFrame }
  | { type: 'streamEnded' };

// Minimal worker-scope shape (avoids pulling the webworker lib program-wide,
// which would collide with the MediaStreamTrackProcessor declaration in main.ts).
interface WorkerScope {
  onmessage: ((ev: MessageEvent<WorkerInMsg>) => void) | null;
  postMessage(msg: WorkerMsg): void;
  addEventListener(type: string, listener: (ev: Event) => void): void;
}
const ctx = self as unknown as WorkerScope;

// Rolling raw-landmark buffer, module-scoped so the `record` arm/disarm message
// (processed by the event loop between the read loop's awaits) and the running
// pump share one instance. Default OFF (Q3=C).
const landmarkBuffer = new LandmarkBuffer();

ctx.onmessage = (ev: MessageEvent<WorkerInMsg>) => {
  const data = ev.data;
  if (data?.type === 'record') {
    landmarkBuffer.arm(data.on);
    return;
  }
  if (data?.type !== 'start') return;
  void run(data).catch((err) => ctx.postMessage({ type: 'error', error: String(err) } satisfies WorkerMsg));
};

// Fetches and validates the trained MLP weights from the extension-origin URL
// resolved by main.ts (StartPump.weightsUrl). This is the local
// web-accessible-resource `fetch` explicitly allowed by the offscreen rule
// (same category as models/hand_landmarker.task) — not the "no network"
// remote-network boundary. Any failure (network, parse, missing layers/labels,
// or a featureVersion that doesn't match the runtime feature layout) falls back
// to KnnClassifier via `classifierFromWeights` and never throws the pump.
async function loadClassifier(weightsUrl: string): Promise<Classifier> {
  try {
    const res = await fetch(weightsUrl);
    if (!res.ok) return new KnnClassifier();
    const json: unknown = await res.json();
    return classifierFromWeights(json);
  } catch {
    return new KnnClassifier();
  }
}

async function run(msg: StartPump): Promise<void> {
  const init = await createHandLandmarker(msg.wasmBase, msg.modelUrl, msg.preferredDelegate);
  let landmarker = init.landmarker;
  let delegate = init.delegate;
  // The OffscreenCanvas MediaPipe bound its GL context to (null for WASM). The
  // `webglcontextlost` listener MUST be on this surface, not the worker global
  // `self`: the event fires on the GL canvas and never reaches `self`, so the
  // old listener was dead code and the recreate never ran (finding 2).
  let glCanvas = init.canvas;
  ctx.postMessage({ type: 'ready', delegate } satisfies WorkerMsg);

  // A `webglcontextlost` event on the GPU delegate is fatal to the current
  // landmarker; rebuild it (falling back to WASM if the cost-based selection
  // now prefers it) rather than let the pump silently stop producing frames.
  // `contextLost` gates the read loop for the ms it takes to rebuild so we
  // don't hammer `detectForVideo` against a dead GL context.
  let contextLost = false;
  const onContextLost = (ev: Event): void => {
    (ev as { preventDefault?: () => void }).preventDefault?.();
    if (contextLost) return;
    contextLost = true;
    void recreateHandLandmarker(msg.wasmBase, msg.modelUrl)
      .then((next: MediaPipeInit) => {
        landmarker = next.landmarker;
        delegate = next.delegate;
        attachContextLostListener(next.canvas);
        contextLost = false;
      })
      .catch((err) => {
        ctx.postMessage({ type: 'error', error: String(err) } satisfies WorkerMsg);
        contextLost = false;
      });
  };
  function attachContextLostListener(canvas: OffscreenCanvas | null): void {
    glCanvas = canvas;
    canvas?.addEventListener('webglcontextlost', onContextLost);
  }
  attachContextLostListener(glCanvas);

  // Test-only hook: let adaptive-fps.e2e.ts drive a real WEBGL_lose_context on
  // MediaPipe's GL surface (which we now own) to prove the recovery path.
  // `VITE_TEST_HOOKS` is never set by `wxt build`, so this whole block is absent
  // from production output. The service worker (same extension origin) posts on
  // the channel; getting webgl2 from our canvas returns MediaPipe's own context.
  if (import.meta.env.VITE_TEST_HOOKS === '1') {
    const testChannel = new BroadcastChannel('gesture-e2e');
    testChannel.onmessage = (ev: MessageEvent): void => {
      if (ev.data !== 'lose-webgl-context') return;
      const gl = glCanvas?.getContext('webgl2') as WebGL2RenderingContext | null;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }

  const canvas = new OffscreenCanvas(1, 1);
  const draw = canvas.getContext('2d');
  if (!draw) throw new Error('OffscreenCanvas 2d context unavailable');

  const classifier = await loadClassifier(msg.weightsUrl);
  const log = new FpsLogger(msg.windowMs);
  const stageTimer = new StageTimer(msg.windowMs);
  const gestureFrames = createGestureFrameSource(classifier);
  const reader = msg.stream.getReader();
  let sized = false;
  let lastEmit = performance.now();
  // detectForVideo needs strictly increasing timestamps; keep a monotonic counter.
  let videoTs = 0;
  // fps-policy state: seeded lazily with the first frame's ts so pump start
  // counts as recent activity (30fps for the first idleWindow, then
  // downshifts if no hand ever appears).
  const fpsState: FpsPolicyState = { lastHandSeenTs: null, lastInferTs: null };

  for (;;) {
    const { value: frame, done } = await reader.read();
    if (done) {
      ctx.postMessage({ type: 'streamEnded' } satisfies WorkerMsg);
      break;
    }
    if (!frame) continue;
    if (!sized) {
      canvas.width = frame.displayWidth;
      canvas.height = frame.displayHeight;
      sized = true;
    }
    // captureMs = the cost of drawing this camera frame onto the inference
    // canvas (diagnostics stage timing, 1D.5). Measured every read; recorded on
    // the StageTimer only for frames we actually infer below.
    const captureStart = performance.now();
    draw.drawImage(frame, 0, 0);
    const captureMs = performance.now() - captureStart;
    // Every camera frame is read and closed here regardless of the fps
    // policy's decision below — we never leak a VideoFrame or let the
    // stream backpressure on a skipped inference.
    frame.close();

    const now = performance.now();
    if (fpsState.lastHandSeenTs === null) fpsState.lastHandSeenTs = now;

    if (!contextLost && shouldInfer(fpsState, now, DEFAULT_FPS_POLICY_PARAMS)) {
      videoTs += 1;
      fpsState.lastInferTs = now;
      // Flatten hand[0]'s 21 {x,y,z} points to a flat number[63], or null when
      // no hand is present. Landmarks never leave this worker — only the
      // derived GestureFrame (without a `landmarks` field) is posted out.
      let flatLandmarks: number[] | null = null;
      const detectStart = performance.now();
      try {
        const result = landmarker.detectForVideo(canvas, videoTs);
        const hand = result.landmarks[0];
        if (hand) {
          flatLandmarks = hand.flatMap((p) => [p.x, p.y, p.z]);
          fpsState.lastHandSeenTs = now;
        }
      } catch {
        // A single detect failure must not stall the pump; keep measuring delivery.
      }
      const inferMs = performance.now() - detectStart;
      reportFrameCostMs(delegate, inferMs);

      const derive: DeriveTimings = { normalizeMs: 0, classifyMs: 0, filterMs: 0 };
      const frame = gestureFrames.next(flatLandmarks, now, derive);
      // Recording-armed: retain this frame's raw landmarks in the bounded ring
      // and attach them to the emitted GestureFrame so the SW can build the
      // full-pipeline replay window (Task 4). Disarmed, `landmarks` stays absent
      // and no landmarks cross the Port (offscreen.md steady-state rule).
      if (landmarkBuffer.isArmed && flatLandmarks) {
        landmarkBuffer.record(flatLandmarks);
        frame.landmarks = landmarkBuffer.latest();
      }
      ctx.postMessage({ type: 'frame', frame } satisfies WorkerMsg);
      log.mark(now);
      stageTimer.record(now, { captureMs, inferMs, ...derive });
    } else {
      // Read but not inferred (fps-policy skip or a lost GL context): a dropped
      // frame for the diagnostics dropped-frame count.
      stageTimer.drop();
    }

    if (now - lastEmit >= msg.windowMs) {
      const w = log.sample(now);
      const s = stageTimer.sample(now);
      ctx.postMessage({
        type: 'stat',
        ts: now,
        fps: w.fps,
        frames: w.frames,
        windowMs: w.windowMs,
        delegate,
        stages: s.stages,
        dropped: s.dropped,
      } satisfies WorkerMsg);
      lastEmit = now;
    }
  }
}
