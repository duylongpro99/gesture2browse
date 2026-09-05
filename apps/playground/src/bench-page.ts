import { runBench, type BenchOptions, type Delegate, type Recognizer, type Resolution } from './bench.js';
import { benchToCsv } from './csv.js';

declare global {
  interface Window {
    __benchDone?: boolean;
    __benchCsv?: string;
    __benchError?: string;
  }
}

const DELEGATES: Delegate[] = ['wasm', 'webgl'];
const RECOGNIZERS: Recognizer[] = ['handlandmarker', 'gesturerecognizer'];
const RESOLUTIONS: Resolution[] = ['480p', '720p'];

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function readOptions(): BenchOptions {
  const q = new URLSearchParams(location.search);
  const frames = Number(q.get('frames') ?? '30');
  const numHands = Number(q.get('numHands') ?? '1');
  return {
    delegate: pick(q.get('delegate'), DELEGATES, 'wasm'),
    recognizer: pick(q.get('recognizer'), RECOGNIZERS, 'handlandmarker'),
    resolution: pick(q.get('resolution'), RESOLUTIONS, '480p'),
    frames: Number.isFinite(frames) && frames > 0 ? Math.floor(frames) : 30,
    numHands: Number.isFinite(numHands) && numHands > 0 ? Math.floor(numHands) : 1,
    device: q.get('device') ?? 'unknown',
  };
}

async function main(): Promise<void> {
  const status = document.getElementById('status');
  const csvEl = document.getElementById('csv');
  try {
    if (status) status.textContent = 'running';
    const row = await runBench(readOptions());
    const csv = benchToCsv([row]);
    window.__benchCsv = csv;
    if (csvEl) csvEl.textContent = csv;
    if (status) status.textContent = 'done';
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    window.__benchError = msg;
    if (status) status.textContent = `error: ${msg}`;
  } finally {
    window.__benchDone = true;
  }
}

void main();
