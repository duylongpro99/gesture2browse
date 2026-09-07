import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { Delegate } from '@gesture/protocol';

// MediaPipe HandLandmarker init for the G1 pump. Worker-safe: it takes the WASM
// base URL and the model URL as arguments and never touches `chrome.*` (the
// `chrome` namespace is unavailable in a dedicated worker), so the offscreen
// document resolves the packaged URLs with chrome.runtime.getURL and passes them
// in. Assets are local web-accessible resources (no CDN — tech-stack §2/§6).

export interface MediaPipeInit {
  landmarker: HandLandmarker;
  /** Delegate that actually initialised ('webgl' = GPU, 'wasm' = CPU/SIMD). */
  delegate: Delegate;
}

const MP_DELEGATE: Record<Delegate, 'GPU' | 'CPU'> = { webgl: 'GPU', wasm: 'CPU' };

// Cost budgets for the delegate decision (arch §3.1 defaults): if the WebGL
// (GPU) delegate is slower than these budgets, WASM (CPU/SIMD) is the better
// choice even though init succeeded. Init cost is measured for
// `createFromOptions` itself; per-frame cost is measured by the caller's
// first `detectForVideo` and reported back in via `reportFrameCostMs` so a
// slow-but-successful GPU init can still be downgraded before it does real
// damage to the frame budget.
export const DELEGATE_COST_BUDGET = {
  initMs: 5000,
  perFrameMs: 40,
};

// Process-lifetime cache of the delegate decision: once a delegate has been
// measured as too slow, every subsequent create (including a context-loss
// recreate) skips straight to the cheaper one instead of re-paying the
// failed budget check.
let cachedChoice: Delegate | null = null;

async function timeInit(
  fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  modelUrl: string,
  delegate: Delegate,
): Promise<{ landmarker: HandLandmarker; elapsedMs: number }> {
  const start = performance.now();
  const landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelUrl, delegate: MP_DELEGATE[delegate] },
    runningMode: 'VIDEO',
    numHands: 1,
  });
  return { landmarker, elapsedMs: performance.now() - start };
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
      const { landmarker, elapsedMs } = await timeInit(fileset, modelUrl, delegate);
      if (delegate === 'webgl' && elapsedMs > DELEGATE_COST_BUDGET.initMs && order.includes('wasm')) {
        // GPU init "succeeded" but is over budget: prefer WASM instead, and
        // remember not to try WebGL again for the rest of this worker's life.
        landmarker.close();
        cachedChoice = 'wasm';
        continue;
      }
      cachedChoice = delegate;
      return { landmarker, delegate };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`HandLandmarker init failed for all delegates: ${String(lastErr)}`);
}

/**
 * Record a measured per-frame `detectForVideo` cost so a delegate that is
 * technically working but too slow per-frame (over
 * `DELEGATE_COST_BUDGET.perFrameMs`) is remembered as the wrong choice for
 * the next `recreate` (context-loss or otherwise). Pure bookkeeping — does
 * not itself trigger a rebuild; the worker decides when to call `recreate`.
 */
export function reportFrameCostMs(delegate: Delegate, elapsedMs: number): void {
  if (delegate === 'webgl' && elapsedMs > DELEGATE_COST_BUDGET.perFrameMs) {
    cachedChoice = 'wasm';
  }
}

/**
 * Rebuild the HandLandmarker after a fatal condition (WebGL context loss).
 * Applies the same cost-based delegate selection as `createHandLandmarker`,
 * honoring any cached downgrade from a prior slow GPU run.
 */
export async function recreateHandLandmarker(wasmBase: string, modelUrl: string): Promise<MediaPipeInit> {
  return createHandLandmarker(wasmBase, modelUrl, cachedChoice ?? 'webgl');
}

// Test-only: clears the process-lifetime delegate cache between test cases.
export function resetDelegateCache(): void {
  cachedChoice = null;
}
