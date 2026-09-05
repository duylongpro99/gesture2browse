import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { BenchRowSchema, type BenchRow } from '@gesture/protocol';
import { KnnClassifier, OneEuroFilter, normalizeLandmarks } from '@gesture/gesture-core';

export type Delegate = 'wasm' | 'webgl';
export type Recognizer = 'handlandmarker' | 'gesturerecognizer';
export type Resolution = '480p' | '720p';

export interface BenchOptions {
  delegate: Delegate;
  recognizer: Recognizer;
  resolution: Resolution;
  frames: number;
  numHands: number;
  device: string;
}

const RES: Record<Resolution, { width: number; height: number }> = {
  '480p': { width: 640, height: 480 },
  '720p': { width: 1280, height: 720 },
};

const MODEL_URL = '/models/hand_landmarker.task';
const WASM_BASE = '/models/wasm';

/**
 * Run `opts.frames` frames from the (fake) camera through the fast-loop stages —
 * capture, MediaPipe inference, normalize, classify, 1€ filter — timing each and
 * aggregating one {@link BenchRow}. Detections are not required: the placeholder
 * y4m has no hand, so the row is well-formed regardless (spec §7). If MediaPipe
 * cannot initialize (missing model/wasm or no GPU) the run degrades to a valid
 * row whose `notes` records the failure, keeping the harness headless-safe.
 */
export async function runBench(opts: BenchOptions): Promise<BenchRow> {
  const { width, height } = RES[opts.resolution];
  const video = await openCamera(width, height);

  let landmarker: HandLandmarker | null = null;
  let initError = '';
  const initStart = performance.now();
  try {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: opts.delegate === 'webgl' ? 'GPU' : 'CPU' },
      runningMode: 'VIDEO',
      numHands: opts.numHands,
    });
  } catch (err) {
    initError = err instanceof Error ? err.message : String(err);
  }
  const coldInitMs = performance.now() - initStart;

  const capture: number[] = [];
  const infer: number[] = [];
  const normalize: number[] = [];
  const classify: number[] = [];
  const filter: number[] = [];
  const total: number[] = [];

  const classifier = new KnnClassifier();
  const smoother = new OneEuroFilter({ minCutoff: 1, beta: 0.007, dCutoff: 1 });
  let detections = 0;

  const runStart = performance.now();
  for (let i = 0; i < opts.frames; i++) {
    const frameStart = performance.now();

    const capStart = performance.now();
    await nextFrame();
    capture.push(performance.now() - capStart);

    let flat: number[] = new Array<number>(63).fill(0);
    const infStart = performance.now();
    if (landmarker) {
      const ts = Math.round(runStart + i * (1000 / 30)) + 1;
      const result = landmarker.detectForVideo(video, ts);
      const hand = result.landmarks[0];
      if (hand && hand.length === 21) {
        detections++;
        flat = hand.flatMap((p) => [p.x, p.y, p.z]);
      }
    }
    infer.push(performance.now() - infStart);

    const normStart = performance.now();
    const norm = normalizeLandmarks(flat);
    normalize.push(performance.now() - normStart);

    const clsStart = performance.now();
    classifier.classify(norm);
    classify.push(performance.now() - clsStart);

    const fltStart = performance.now();
    smoother.filter(norm[27] ?? 0, frameStart);
    filter.push(performance.now() - fltStart);

    total.push(performance.now() - frameStart);
  }
  const durationMs = performance.now() - runStart;

  stopCamera(video);
  landmarker?.close();

  const instFps = total.map((t) => (t > 0 ? 1000 / t : 0));
  const notes = [
    initError ? `init failed: ${initError}` : `detections=${detections}`,
    opts.recognizer === 'gesturerecognizer' ? 'gesturerecognizer not wired in 0A; used handlandmarker' : '',
  ]
    .filter(Boolean)
    .join('; ');

  const row: BenchRow = {
    device: opts.device,
    delegate: opts.delegate,
    recognizer: opts.recognizer,
    resolution: opts.resolution,
    numHands: opts.numHands,
    frames: opts.frames,
    durationMs: round(durationMs),
    fpsMean: round(opts.frames / (durationMs / 1000)),
    fpsP50: round(pct(instFps, 50)),
    fpsP05: round(pct(instFps, 5)),
    captureMsP50: round(pct(capture, 50)),
    inferMsP50: round(pct(infer, 50)),
    normalizeMsP50: round(pct(normalize, 50)),
    classifyMsP50: round(pct(classify, 50)),
    filterMsP50: round(pct(filter, 50)),
    totalMsP50: round(pct(total, 50)),
    inferMsP95: round(pct(infer, 95)),
    coldInitMs: round(coldInitMs),
    droppedFrames: 0,
    notes,
  };
  return BenchRowSchema.parse(row);
}

async function openCamera(width: number, height: number): Promise<HTMLVideoElement> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: width }, height: { ideal: height } },
  });
  const video = document.getElementById('cam') as HTMLVideoElement | null;
  if (!video) throw new Error('bench: missing <video id="cam">');
  video.srcObject = stream;
  await video.play();
  await until(() => video.videoWidth > 0, 5000);
  return video;
}

function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject;
  if (stream instanceof MediaStream) for (const track of stream.getTracks()) track.stop();
  video.srcObject = null;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function until(test: () => boolean, timeoutMs: number): Promise<void> {
  const start = performance.now();
  while (!test()) {
    if (performance.now() - start > timeoutMs) throw new Error('bench: timed out waiting for camera');
    await nextFrame();
  }
}

function pct(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? 0;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
