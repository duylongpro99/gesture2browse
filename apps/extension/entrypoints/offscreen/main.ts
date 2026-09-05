/// <reference types="vite/client" />
import { browser } from 'wxt/browser';
import type { PumpStat } from '@gesture/protocol';
import InferenceWorker from './inference.worker?worker';
import type { StartPump, WorkerMsg } from './inference.worker';

// Offscreen document — owner of the camera and the G1 frame pump. It opens the
// camera, wires getUserMedia -> MediaStreamTrackProcessor -> a transferred
// ReadableStream<VideoFrame> into the inference worker, then relays each fps
// window to the service worker as a PumpStat. Raw video and VideoFrame never
// leave this document (they are transferred into the worker and closed there);
// only the numeric PumpStat crosses to the SW, which owns chrome.storage
// (.claude/rules/offscreen.md forbids storage here).

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
