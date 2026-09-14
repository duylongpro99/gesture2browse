import { z } from 'zod';
import { DelegateSchema } from './bench.js';

// StageTimings — per-frame processing time split across the pipeline stages the
// offscreen worker runs (milestone 1D.5). Measurement only, not gesture-timing
// logic; the keys echo the BenchRow columns (bench.ts) so perf CI can join live
// timings against the Phase-0 bench (1E, §4.5). Co-located with PumpStat because
// the extended PumpStat carries it; diagnostics.ts imports PumpStatSchema, so
// defining StageTimings here keeps the dependency edge one-way.
export const StageTimingsSchema = z.object({
  captureMs: z.number(), // draw/copy the VideoFrame for inference
  inferMs: z.number(), // MediaPipe detectForVideo
  normalizeMs: z.number(), // landmark -> feature normalization
  classifyMs: z.number(), // gesture classification
  filterMs: z.number(), // smoothing / debounce filter
});
export type StageTimings = z.infer<typeof StageTimingsSchema>;

// PumpStat — offscreen document -> service worker frame-pump telemetry (gate G1,
// milestone 0B). Diagnostic/spike-scoped: it carries the throughput of the
// hidden offscreen pump so background.ts can surface an fps readout. Only this
// numeric sample crosses the boundary; VideoFrame/landmarks stay in the worker
// (02-architecture §1, boundary-lint rule 1). `delegate` reuses the bench
// DelegateSchema so the MediaPipe delegate has one name across the protocol.
// 1D.5 adds `stages`/`dropped` ADDITIVELY (both optional) so every 0B producer
// (fps only) stays valid.
export const PumpStatSchema = z.object({
  ts: z.number(), // performance.now() in the worker at window close
  fps: z.number(), // frames delivered in the window / (windowMs / 1000)
  frames: z.number().int().nonnegative(), // frames counted in the window
  windowMs: z.number().positive(), // window length in ms
  delegate: DelegateSchema, // 'webgl' (GPU) or 'wasm' (CPU/SIMD) MediaPipe delegate
  hidden: z.boolean(), // document.hidden at sample time (must be true in the gate)
  stages: StageTimingsSchema.optional(), // 1D.5: per-stage timing breakdown
  dropped: z.number().int().nonnegative().optional(), // 1D.5: frames dropped in the window
});
export type PumpStat = z.infer<typeof PumpStatSchema>;
