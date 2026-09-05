import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { FixtureRecordSchema, type FixtureFrame, type FixtureRecord } from '@gesture/protocol';

// Owner-run live-camera recorder. NOT part of CI (no fake camera, no assertion):
// the owner opens recorder.html, records a gesture, and downloads a FixtureRecord
// JSON (raw + world landmarks) for the fixtures/ corpus. Verified by the owner,
// per .claude/rules/fixtures-and-tests.md ("Real-camera checks are owner work").

const MODEL_URL = '/models/hand_landmarker.task';
const WASM_BASE = '/models/wasm';

interface RecorderState {
  video: HTMLVideoElement;
  landmarker: HandLandmarker;
  frames: FixtureFrame[];
  running: boolean;
  startTs: number;
}

async function createLandmarker(): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 1,
  });
}

function loop(state: RecorderState): void {
  if (!state.running) return;
  const ts = performance.now();
  const result = state.landmarker.detectForVideo(state.video, Math.round(ts));
  const hand = result.landmarks[0];
  const world = result.worldLandmarks[0];
  state.frames.push({
    ts: Math.round(ts - state.startTs),
    present: hand !== undefined,
    landmarks: hand ? hand.flatMap((p) => [p.x, p.y, p.z]) : undefined,
    worldLandmarks: world ? world.flatMap((p) => [p.x, p.y, p.z]) : undefined,
  });
  requestAnimationFrame(() => loop(state));
}

function download(record: FixtureRecord): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recording-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function startRecorder(): Promise<void> {
  const status = document.getElementById('status');
  const setStatus = (t: string): void => {
    if (status) status.textContent = t;
  };

  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } });
  const video = document.getElementById('cam') as HTMLVideoElement | null;
  if (!video) throw new Error('recorder: missing <video id="cam">');
  video.srcObject = stream;
  await video.play();

  const state: RecorderState = {
    video,
    landmarker: await createLandmarker(),
    frames: [],
    running: false,
    startTs: 0,
  };

  const start = document.getElementById('start');
  const stop = document.getElementById('stop');

  start?.addEventListener('click', () => {
    state.frames = [];
    state.startTs = performance.now();
    state.running = true;
    setStatus('recording');
    loop(state);
  });

  stop?.addEventListener('click', () => {
    state.running = false;
    const record: FixtureRecord = FixtureRecordSchema.parse({
      schema: 'gesture-fixture/v0',
      meta: {
        subjectId: 'owner',
        gestureLabel: 'none',
        distanceM: 1.0,
        palmOrientation: 'toward',
        handedness: 'Right',
        fps: 30,
        source: 'recorder',
        recordedAt: new Date().toISOString(),
      },
      frames: state.frames,
    });
    download(record);
    setStatus(`saved ${state.frames.length} frames`);
  });

  setStatus('ready — press Start');
}

if (typeof document !== 'undefined') {
  void startRecorder().catch((err: unknown) => {
    const status = document.getElementById('status');
    if (status) status.textContent = `error: ${err instanceof Error ? err.message : String(err)}`;
  });
}
