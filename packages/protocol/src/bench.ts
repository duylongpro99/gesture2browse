import { z } from 'zod';

export const DelegateSchema = z.enum(['webgl', 'wasm']);
export type Delegate = z.infer<typeof DelegateSchema>;
export const RecognizerSchema = z.enum(['handlandmarker', 'gesturerecognizer']);
export type Recognizer = z.infer<typeof RecognizerSchema>;
export const ResolutionSchema = z.enum(['480p', '720p']);
export type Resolution = z.infer<typeof ResolutionSchema>;

export const BENCH_COLUMNS = [
  'device',
  'delegate',
  'recognizer',
  'resolution',
  'numHands',
  'frames',
  'durationMs',
  'fpsMean',
  'fpsP50',
  'fpsP05',
  'captureMsP50',
  'inferMsP50',
  'normalizeMsP50',
  'classifyMsP50',
  'filterMsP50',
  'totalMsP50',
  'inferMsP95',
  'coldInitMs',
  'droppedFrames',
  'notes',
] as const;

export const BenchRowSchema = z.object({
  device: z.string(),
  delegate: DelegateSchema,
  recognizer: RecognizerSchema,
  resolution: ResolutionSchema,
  numHands: z.number(),
  frames: z.number(),
  durationMs: z.number(),
  fpsMean: z.number(),
  fpsP50: z.number(),
  fpsP05: z.number(),
  captureMsP50: z.number(),
  inferMsP50: z.number(),
  normalizeMsP50: z.number(),
  classifyMsP50: z.number(),
  filterMsP50: z.number(),
  totalMsP50: z.number(),
  inferMsP95: z.number(),
  coldInitMs: z.number(),
  droppedFrames: z.number(),
  notes: z.string(),
});
export type BenchRow = z.infer<typeof BenchRowSchema>;
