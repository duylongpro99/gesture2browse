import type { Delegate, GestureFrame } from '@gesture/protocol';
import { KnnClassifier, type Classifier } from '@gesture/gesture-core';
import { createHandLandmarker, recreateHandLandmarker, reportFrameCostMs, type MediaPipeInit } from './mediapipe';
import { classifierFromWeights } from './classifier-select';
import { FpsLogger } from './fps-logger';
import { createGestureFrameSource } from './gesture-frame';
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

/** Worker -> offscreen document (intra-document; not the protocol boundary). */
export type WorkerMsg =
  | { type: 'ready'; delegate: Delegate }
  | { type: 'error'; error: string }
  | { type: 'stat'; ts: number; fps: number; frames: number; windowMs: number; delegate: Delegate }
  | { type: 'frame'; frame: GestureFrame }
  | { type: 'streamEnded' };

// Minimal worker-scope shape (avoids pulling the webworker lib program-wide,
// which would collide with the MediaStreamTrackProcessor declaration in main.ts).
interface WorkerScope {
  onmessage: ((ev: MessageEvent<StartPump>) => void) | null;
  postMessage(msg: WorkerMsg): void;
  addEventListener(type: string, listener: (ev: Event) => void): void;
}
const ctx = self as unknown as WorkerScope;

ctx.onmessage = (ev: MessageEvent<StartPump>) => {
  if (ev.data?.type !== 'start') return;
  void run(ev.data).catch((err) => ctx.postMessage({ type: 'error', error: String(err) } satisfies WorkerMsg));
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
    draw.drawImage(frame, 0, 0);
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
      reportFrameCostMs(delegate, performance.now() - detectStart);

      ctx.postMessage({ type: 'frame', frame: gestureFrames.next(flatLandmarks, now) } satisfies WorkerMsg);
      log.mark(now);
    }

    if (now - lastEmit >= msg.windowMs) {
      const w = log.sample(now);
      ctx.postMessage({
        type: 'stat',
        ts: now,
        fps: w.fps,
        frames: w.frames,
        windowMs: w.windowMs,
        delegate,
      } satisfies WorkerMsg);
      lastEmit = now;
    }
  }
}
