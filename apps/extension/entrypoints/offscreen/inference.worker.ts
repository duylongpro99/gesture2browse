import type { Delegate } from '@gesture/protocol';
import { createHandLandmarker } from './mediapipe';
import { FpsLogger } from './fps-logger';

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
  windowMs: number;
  preferredDelegate: Delegate;
}

/** Worker -> offscreen document (intra-document; not the protocol boundary). */
export type WorkerMsg =
  | { type: 'ready'; delegate: Delegate }
  | { type: 'error'; error: string }
  | { type: 'stat'; ts: number; fps: number; frames: number; windowMs: number; delegate: Delegate };

// Minimal worker-scope shape (avoids pulling the webworker lib program-wide,
// which would collide with the MediaStreamTrackProcessor declaration in main.ts).
interface WorkerScope {
  onmessage: ((ev: MessageEvent<StartPump>) => void) | null;
  postMessage(msg: WorkerMsg): void;
}
const ctx = self as unknown as WorkerScope;

ctx.onmessage = (ev: MessageEvent<StartPump>) => {
  if (ev.data?.type !== 'start') return;
  void run(ev.data).catch((err) => ctx.postMessage({ type: 'error', error: String(err) } satisfies WorkerMsg));
};

async function run(msg: StartPump): Promise<void> {
  const { landmarker, delegate } = await createHandLandmarker(msg.wasmBase, msg.modelUrl, msg.preferredDelegate);
  ctx.postMessage({ type: 'ready', delegate } satisfies WorkerMsg);

  const canvas = new OffscreenCanvas(1, 1);
  const draw = canvas.getContext('2d');
  if (!draw) throw new Error('OffscreenCanvas 2d context unavailable');

  const log = new FpsLogger(msg.windowMs);
  const reader = msg.stream.getReader();
  let sized = false;
  let lastEmit = performance.now();
  // detectForVideo needs strictly increasing timestamps; keep a monotonic counter.
  let videoTs = 0;

  for (;;) {
    const { value: frame, done } = await reader.read();
    if (done) break;
    if (!frame) continue;
    if (!sized) {
      canvas.width = frame.displayWidth;
      canvas.height = frame.displayHeight;
      sized = true;
    }
    draw.drawImage(frame, 0, 0);
    frame.close();

    videoTs += 1;
    try {
      landmarker.detectForVideo(canvas, videoTs);
    } catch {
      // A single detect failure must not stall the pump; keep measuring delivery.
    }

    const now = performance.now();
    log.mark(now);
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
