import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { Delegate } from '@gesture/protocol';
import {
  observeFrameCost,
  DEFAULT_DELEGATE_COST_PARAMS,
  DEFAULT_DELEGATE_COST_STATE,
  type DelegateCostState,
} from './delegate-cost';

// MediaPipe HandLandmarker init for the G1 pump. Worker-safe: it takes the WASM
// base URL and the model URL as arguments and never touches `chrome.*` (the
// `chrome` namespace is unavailable in a dedicated worker), so the offscreen
// document resolves the packaged URLs with chrome.runtime.getURL and passes them
// in. Assets are local web-accessible resources (no CDN — tech-stack §2/§6).

export interface MediaPipeInit {
  landmarker: HandLandmarker;
  /** Delegate that actually initialised ('webgl' = GPU, 'wasm' = CPU/SIMD). */
  delegate: Delegate;
  /**
   * The OffscreenCanvas we handed MediaPipe for its WebGL context, or null for
   * the WASM (CPU) delegate which has no GL surface. Owning this canvas is what
   * makes `webglcontextlost` observable: MediaPipe binds its GL context to it,
   * so the worker can listen for the loss on the *real* surface (finding 2 — the
   * old listener was on the worker global `self`, where the event never fires).
   */
  canvas: OffscreenCanvas | null;
}

const MP_DELEGATE: Record<Delegate, 'GPU' | 'CPU'> = { webgl: 'GPU', wasm: 'CPU' };

// Init-cost budget (arch §3.1 default): if the WebGL (GPU) delegate takes longer
// than this to `createFromOptions`, WASM (CPU/SIMD) is the better choice even
// though init succeeded. Per-frame cost is measured by the caller's
// `detectForVideo` and reported back via `reportFrameCostMs`, which folds it
// through the sustained-cost reducer in delegate-cost.ts.
export const DELEGATE_COST_BUDGET = {
  initMs: 5000,
  perFrameMs: DEFAULT_DELEGATE_COST_PARAMS.perFrameMs,
};

// Process-lifetime cache of the delegate decision: once a delegate has been
// measured as too slow, every subsequent create (including a context-loss
// recreate) skips straight to the cheaper one instead of re-paying the
// failed budget check.
let cachedChoice: Delegate | null = null;
// Running per-frame cost state for the sustained-over-budget downgrade.
let costState: DelegateCostState = { ...DEFAULT_DELEGATE_COST_STATE };

async function timeInit(
  fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  modelUrl: string,
  delegate: Delegate,
): Promise<{ landmarker: HandLandmarker; elapsedMs: number; canvas: OffscreenCanvas | null }> {
  // For the GPU delegate, hand MediaPipe our own OffscreenCanvas so its WebGL
  // context is bound to a surface we own and can observe `webglcontextlost` on
  // (VisionTaskOptions.canvas). The WASM delegate needs no GL surface.
  const canvas = delegate === 'webgl' ? new OffscreenCanvas(1, 1) : null;
  const start = performance.now();
  const landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelUrl, delegate: MP_DELEGATE[delegate] },
    runningMode: 'VIDEO',
    numHands: 1,
    ...(canvas ? { canvas } : {}),
  });
  return { landmarker, elapsedMs: performance.now() - start, canvas };
}

/**
 * Create a VIDEO-mode HandLandmarker, preferring the WebGL (GPU) delegate and
 * falling back to WASM (CPU) if GPU init throws (e.g. no GL in headless) OR
 * if GPU init succeeds but exceeds `DELEGATE_COST_BUDGET.initMs` (arch §3.1:
 * pick delegates by measured cost, not just availability). The resulting
 * choice is cached for the lifetime of the worker so a later `recreate` (e.g.
 * after `webglcontextlost`) does not re-attempt a delegate already known to
 * be too slow.
 */
export async function createHandLandmarker(
  wasmBase: string,
  modelUrl: string,
  preferred: Delegate = 'webgl',
): Promise<MediaPipeInit> {
  const fileset = await FilesetResolver.forVisionTasks(wasmBase);
  const effectivePreferred = cachedChoice ?? preferred;
  const order: Delegate[] = effectivePreferred === 'webgl' ? ['webgl', 'wasm'] : ['wasm'];
  let lastErr: unknown;
  for (const delegate of order) {
    try {
      const { landmarker, elapsedMs, canvas } = await timeInit(fileset, modelUrl, delegate);
      if (delegate === 'webgl' && elapsedMs > DELEGATE_COST_BUDGET.initMs && order.includes('wasm')) {
        // GPU init "succeeded" but is over budget: prefer WASM instead, and
        // remember not to try WebGL again for the rest of this worker's life.
        landmarker.close();
        cachedChoice = 'wasm';
        continue;
      }
      cachedChoice = delegate;
      // Fresh landmarker => fresh per-frame cost history (warm-up starts over).
      costState = { ...DEFAULT_DELEGATE_COST_STATE };
      return { landmarker, delegate, canvas };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`HandLandmarker init failed for all delegates: ${String(lastErr)}`);
}

/**
 * Record a measured per-frame `detectForVideo` cost. Folds it through the
 * sustained-cost reducer (delegate-cost.ts): a WebGL delegate is remembered as
 * the wrong choice for the next `recreate` only after a *sustained* run of
 * over-budget frames past the warm-up window — a single cold/shader-compile
 * spike no longer pins WASM (finding 3). Pure bookkeeping; the worker decides
 * when to call `recreate`.
 */
export function reportFrameCostMs(delegate: Delegate, elapsedMs: number): void {
  if (delegate !== 'webgl') return;
  const { downgrade, state } = observeFrameCost(costState, elapsedMs, DEFAULT_DELEGATE_COST_PARAMS);
  costState = state;
  if (downgrade) cachedChoice = 'wasm';
}

/**
 * Rebuild the HandLandmarker after a fatal condition (WebGL context loss).
 * Applies the same cost-based delegate selection as `createHandLandmarker`,
 * honoring any cached downgrade from a prior slow GPU run.
 */
export async function recreateHandLandmarker(wasmBase: string, modelUrl: string): Promise<MediaPipeInit> {
  return createHandLandmarker(wasmBase, modelUrl, cachedChoice ?? 'webgl');
}

// Test-only: clears the process-lifetime delegate cache and per-frame cost
// history between test cases.
export function resetDelegateCache(): void {
  cachedChoice = null;
  costState = { ...DEFAULT_DELEGATE_COST_STATE };
}
