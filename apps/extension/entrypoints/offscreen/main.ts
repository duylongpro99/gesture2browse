/// <reference types="vite/client" />
import { browser } from 'wxt/browser';
import type { PumpStat, GestureFrame } from '@gesture/protocol';
import { PortName } from '@gesture/protocol';
import InferenceWorker from './inference.worker?worker';
import type { StartPump, WorkerMsg } from './inference.worker';

// Offscreen document — owner of the camera and the G1 frame pump. It opens the
// camera, wires getUserMedia -> MediaStreamTrackProcessor -> a transferred
// ReadableStream<VideoFrame> into the inference worker, then relays each fps
// window to the service worker as a PumpStat, and each derived GestureFrame
// over a runtime Port. Raw video and VideoFrame never leave this document
// (they are transferred into the worker and closed there); only the numeric
// PumpStat and the (landmarks-less) GestureFrame cross to the SW, which owns
// chrome.storage (.claude/rules/offscreen.md forbids storage here).

// MediaStreamTrackProcessor is a Chrome global not yet in lib.dom.
declare global {
  interface MediaStreamTrackProcessorInit {
    track: MediaStreamTrack;
  }
  class MediaStreamTrackProcessor<T = VideoFrame> {
    constructor(init: MediaStreamTrackProcessorInit);
    readable: ReadableStream<T>;
  }
}

const WINDOW_MS = 2000;

// The MediaPipe assets are copied into the build under /models and /wasm at build
// time (wxt.config build hook), so they are not in the typed PublicPath union.
// Derive their URLs from the extension origin ('/' is a known PublicPath).
const origin = browser.runtime.getURL('/');
const WASM_BASE = new URL('wasm', origin).href;
const MODEL_URL = new URL('models/hand_landmarker.task', origin).href;

// Long-lived Port to the service worker carrying discrete GestureFrames (arch
// §3.1/§3.2). Opened once at document load, independent of pump start/stop.
const swPort = browser.runtime.connect({ name: PortName.OffscreenToServiceWorker });

async function startPump(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 },
    audio: false,
  });
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error('no video track from getUserMedia');

  const processor = new MediaStreamTrackProcessor<VideoFrame>({ track });
  const readable = processor.readable;

  const worker = new InferenceWorker();
  worker.onmessage = (ev: MessageEvent<WorkerMsg>) => {
    const m = ev.data;
    if (m.type === 'stat') {
      const stat: PumpStat = {
        ts: m.ts,
        fps: m.fps,
        frames: m.frames,
        windowMs: m.windowMs,
        delegate: m.delegate,
        hidden: document.hidden, // offscreen documents are always hidden — the gate condition
      };
      void browser.runtime.sendMessage({ type: 'PumpStat', stat });
    } else if (m.type === 'error') {
      void browser.runtime.sendMessage({ type: 'PumpError', error: m.error });
    } else if (m.type === 'frame') {
      swPort.postMessage(m.frame);
    }
  };

  const start: StartPump = {
    type: 'start',
    stream: readable,
    wasmBase: WASM_BASE,
    modelUrl: MODEL_URL,
    windowMs: WINDOW_MS,
    preferredDelegate: 'webgl',
  };
  worker.postMessage(start, [readable]);
}

void startPump().catch((err) => {
  void browser.runtime.sendMessage({ type: 'PumpError', error: String(err) });
});

// Test-only hook: lets a Playwright test (Task 6) drive a deterministic gesture
// over the same port without a trained classifier, by injecting synthetic
// GestureFrames directly. `VITE_TEST_HOOKS` is never set by `wxt build`
// (production), so this entire block — including the onMessage listener — is
// absent from production output.
if (import.meta.env.VITE_TEST_HOOKS === '1') {
  interface InjectFrames {
    type: '__inject_frames';
    frames: GestureFrame[];
  }
  browser.runtime.onMessage.addListener((message: unknown) => {
    const m = message as Partial<InjectFrames> | undefined;
    if (m?.type !== '__inject_frames' || !Array.isArray(m.frames)) return;
    for (const frame of m.frames) swPort.postMessage(frame);
  });
}
