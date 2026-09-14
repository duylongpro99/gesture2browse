import { z } from 'zod';
import { GestureLabel } from './common.js';
import { FixtureFrameSchema } from './fixture.js';
import { PumpStatSchema } from './pump.js';
import { TransitionLogEntrySchema } from './transition.js';

// Diagnostics shapes (milestone 1D.5). Additive, protocol-first: the diagnostics
// page (page↔SW↔storage) and the false-positive log speak these. Names come from
// docs/02-architecture §6 / the plan; no gesture-timing constant lives here.

// FrameSample — a GestureFrame-feature slice (no landmarks) kept in the SW's
// rolling window and replayed at FSM level. Owner-annotated false positives
// always carry a window of these (Q2); landmarks are separate and optional.
export const FrameSampleSchema = z.object({
  ts: z.number(),
  present: z.boolean(),
  gesture: GestureLabel.optional(),
  score: z.number(),
  pinch: z.number().optional(), // absent when no hand is present
  velocity: z.object({ vx: z.number(), vy: z.number() }),
});
export type FrameSample = z.infer<typeof FrameSampleSchema>;

// FalsePositiveEntry — one owner annotation of a specific past event (Q2). It
// ALWAYS carries a feature window (FSM-level replay) and OPTIONALLY a raw-landmark
// window (full-pipeline replay) recorded only while record-landmarks was armed
// (Q3=C). The landmark window reuses FixtureFrame so gesture-core can replay it.
export const FalsePositiveEntrySchema = z.object({
  ts: z.number(), // when the owner flagged it (performance.now())
  eventTs: z.number(), // the ts of the event being flagged
  note: z.string().optional(),
  transition: TransitionLogEntrySchema.optional(),
  frameWindow: z.array(FrameSampleSchema), // required
  landmarkWindow: z.array(FixtureFrameSchema).optional(), // only when armed
});
export type FalsePositiveEntry = z.infer<typeof FalsePositiveEntrySchema>;

// DiagnosticsConfig — persisted diagnostics settings. The record-landmarks toggle
// defaults OFF (Q3=C); the SW relays it to offscreen and persists it.
export const DiagnosticsConfigSchema = z.object({
  recordLandmarks: z.boolean(),
});
export type DiagnosticsConfig = z.infer<typeof DiagnosticsConfigSchema>;

// DiagnosticsExport — the JSON blob the page downloads and 1E replays against
// fixtures via gesture-core.
export const DiagnosticsExportSchema = z.object({
  schema: z.literal('gesture-diagnostics/v0'),
  exportedAt: z.string(), // ISO timestamp
  fps: z.array(PumpStatSchema),
  transitions: z.array(TransitionLogEntrySchema),
  falsePositives: z.array(FalsePositiveEntrySchema),
  config: DiagnosticsConfigSchema,
});
export type DiagnosticsExport = z.infer<typeof DiagnosticsExportSchema>;
