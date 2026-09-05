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

/**
 * Create a VIDEO-mode HandLandmarker, preferring the WebGL (GPU) delegate and
 * falling back to WASM (CPU) if GPU init throws (e.g. no GL in headless).
 */
export async function createHandLandmarker(
  wasmBase: string,
  modelUrl: string,
  preferred: Delegate = 'webgl',
): Promise<MediaPipeInit> {
  const fileset = await FilesetResolver.forVisionTasks(wasmBase);
  const order: Delegate[] = preferred === 'webgl' ? ['webgl', 'wasm'] : ['wasm'];
  let lastErr: unknown;
  for (const delegate of order) {
    try {
      const landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate: MP_DELEGATE[delegate] },
        runningMode: 'VIDEO',
        numHands: 1,
      });
      return { landmarker, delegate };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`HandLandmarker init failed for all delegates: ${String(lastErr)}`);
}
