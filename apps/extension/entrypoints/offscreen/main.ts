/// <reference types="vite/client" />

import type { GestureFrame, PumpStat } from '@gesture/protocol';
import { PortName } from '@gesture/protocol';
import { browser } from 'wxt/browser';
import type { StartPump, WorkerMsg } from './inference.worker';
import InferenceWorker from './inference.worker?worker';
import {
  DEFAULT_RESTART_PARAMS,
  type RestartState,
  recordRestart,
  shouldRestart,
} from './lifecycle';

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
const WEIGHTS_URL = new URL('models/gesture-mlp.json', origin).href;

// Long-lived Port to the service worker carrying discrete GestureFrames (arch
// §3.1/§3.2). Opened at document load, independent of pump start/stop.
//
// The service worker can be torn down and respawned (MV3 idle eviction, crash,
// or the E3 SW-kill recovery check); the offscreen document outlives it, so this
// bare port would go dead and GestureFrames would silently stop flowing after a
// restart. Re-establish it on disconnect (a `connect` also wakes a stopped
// worker), rate-limited so a persistently-dead worker cannot spin a tight connect
// loop. This is a lifecycle throttle (like lifecycle.ts's restart interval), not
// gesture timing. Every reader below references the mutable `swPort`, so the
// frame-push and the test-only injection hook both follow the reconnected port.
// This stays within .claude/rules/offscreen.md: still only a GestureFrame Port,
// no new deps, no gesture timing, no video/frame export.
const RECONNECT_DELAY_MS = 250;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let swPort = browser.runtime.connect({
  name: PortName.OffscreenToServiceWorker,
});

function bindSwReconnect(
  port: ReturnType<typeof browser.runtime.connect>,
): void {
  port.onDisconnect.addListener(() => {
    if (reconnectTimer !== null) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      swPort = browser.runtime.connect({
        name: PortName.OffscreenToServiceWorker,
      });
      bindSwReconnect(swPort);
    }, RECONNECT_DELAY_MS);
  });
}
bindSwReconnect(swPort);

// Test-only: once a Playwright test starts injecting synthetic frames through the
// `__inject_frames` hook below, the live perception stream is suppressed so the
// injected frames are the FSM's sole, DETERMINISTIC input — which is the whole
// point of that hook. Otherwise the live ~16fps `present:false` frames from the
// hand-less fake camera compete for the single shared FSM (their `pinch: 0`
// spuriously fires pinch/drag once armed), making a scripted click impossible.
// Never set in production: only the VITE_TEST_HOOKS block sets it, so the guard
// on the live frame push below is a constant no-op in a `wxt build`.
let suppressLiveFrames = false;

// The currently-running worker/stream/track, held here so the restart path
// (below) can tear them down before re-acquiring the camera. Set once
// startPump's async setup completes; null while no pump is running.
interface PumpHandle {
  worker: Worker;
  stream: MediaStream;
  track: MediaStreamTrack;
  /** Removes the track's `ended` listener on teardown (no dangling closure
   * over a dead handle). */
  onEnded: () => void;
  /** Guards against the worker's `streamEnded` message and the track's
   * `ended` event both firing a restart for the same stream end. */
  restarted: boolean;
}
let current: PumpHandle | null = null;

// Restart-storm guard state (Task 6): shared across the lifetime of the
// document so a camera that keeps ending immediately does not spin-loop
// getUserMedia. Lifecycle concern, not gesture timing (CLAUDE.md §2).
const restartState: RestartState = { restartTimes: [] };

// A single deferred re-attempt timer (offscreen is a DOCUMENT, so timers are
// allowed here — the no-timers rule is gesture-core's, not offscreen's; see
// CLAUDE.md §2 and .claude/rules/offscreen.md). Guarded so a refusal never
// stacks more than one pending retry.
let pendingRetry: ReturnType<typeof setTimeout> | null = null;

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
  const onEnded = () => handleStreamEnd(handle);
  const handle: PumpHandle = {
    worker,
    stream,
    track,
    onEnded,
    restarted: false,
  };
  current = handle;

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
      if (!suppressLiveFrames) swPort.postMessage(m.frame);
    } else if (m.type === 'streamEnded') {
      handleStreamEnd(handle);
    }
  };

  track.addEventListener('ended', onEnded);

  const start: StartPump = {
    type: 'start',
    stream: readable,
    wasmBase: WASM_BASE,
    modelUrl: MODEL_URL,
    weightsUrl: WEIGHTS_URL,
    windowMs: WINDOW_MS,
    preferredDelegate: 'webgl',
  };
  worker.postMessage(start, [readable]);
}

// Tears down a dead pump generation: stop listening for `ended` (no
// dangling closure over the dead handle), terminate the worker, and stop
// every track on the stream (covers the video track and, defensively, any
// audio track — a single path rather than also calling `handle.track.stop()`
// separately).
function teardown(handle: PumpHandle): void {
  handle.track.removeEventListener('ended', handle.onEnded);
  handle.worker.terminate();
  for (const t of handle.stream.getTracks()) t.stop();
  if (current === handle) current = null;
}

// Records the restart and re-runs startPump, which re-acquires getUserMedia
// and so re-triggers the SW camera pre-check (spec §6).
function doRestart(now: number): void {
  recordRestart(restartState, now);
  void startPump().catch((err) => {
    void browser.runtime.sendMessage({ type: 'PumpError', error: String(err) });
  });
}

// Triggered by either the worker's `{type:'streamEnded'}` message (reader
// loop saw `done`) or the video track's `ended` event — both can fire for
// the same stream end, so `handle.restarted` dedupes them. Restarts
// immediately when the storm guard allows it; otherwise tears down the dead
// pump now (it must not keep running uselessly) and schedules ONE deferred
// re-attempt so the pump self-recovers once the guard frees up, instead of
// staying dead forever (a refusal is a temporary throttle, not a stop).
function handleStreamEnd(handle: PumpHandle): void {
  if (handle.restarted) return;
  handle.restarted = true;

  const now = performance.now();
  if (shouldRestart(restartState, now)) {
    teardown(handle);
    doRestart(now);
    return;
  }

  void browser.runtime.sendMessage({
    type: 'PumpError',
    error:
      'camera stream ended repeatedly; restart guard refused (restart storm), retrying shortly',
  });
  teardown(handle);
  scheduleRetry();
}

// Schedules a single deferred restart attempt, spaced by
// DEFAULT_RESTART_PARAMS.minIntervalMs (via lifecycle's params — the guard's
// own interval), re-running the same decision when it fires. Guarded by
// `pendingRetry` so a burst of refusals never stacks more than one timer.
function scheduleRetry(): void {
  if (pendingRetry !== null) return;
  pendingRetry = setTimeout(() => {
    pendingRetry = null;
    const now = performance.now();
    if (shouldRestart(restartState, now)) {
      doRestart(now);
    } else {
      scheduleRetry();
    }
  }, DEFAULT_RESTART_PARAMS.minIntervalMs);
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
    // From the first injection on, the live perception stream must not compete
    // with the scripted frames for the shared FSM (see `suppressLiveFrames`).
    suppressLiveFrames = true;
    for (const frame of m.frames) swPort.postMessage(frame);
  });
}
