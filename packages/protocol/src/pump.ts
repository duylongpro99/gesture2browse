import { z } from 'zod';
import { DelegateSchema } from './bench.js';

// PumpStat — offscreen document -> service worker frame-pump telemetry (gate G1,
// milestone 0B). Diagnostic/spike-scoped: it carries the throughput of the
// hidden offscreen pump so background.ts can surface an fps readout. Only this
// numeric sample crosses the boundary; VideoFrame/landmarks stay in the worker
// (02-architecture §1, boundary-lint rule 1). `delegate` reuses the bench
// DelegateSchema so the MediaPipe delegate has one name across the protocol.
export const PumpStatSchema = z.object({
  ts: z.number(), // performance.now() in the worker at window close
  fps: z.number(), // frames delivered in the window / (windowMs / 1000)
  frames: z.number().int().nonnegative(), // frames counted in the window
  windowMs: z.number().positive(), // window length in ms
  delegate: DelegateSchema, // 'webgl' (GPU) or 'wasm' (CPU/SIMD) MediaPipe delegate
  hidden: z.boolean(), // document.hidden at sample time (must be true in the gate)
});
export type PumpStat = z.infer<typeof PumpStatSchema>;
