import { z } from 'zod';
import { Handedness, GestureLabel } from './common.js';

export const FixtureFrameSchema = z.object({
  ts: z.number(),
  present: z.boolean(),
  landmarks: z.array(z.number()).length(63).optional(),
  worldLandmarks: z.array(z.number()).length(63).optional(),
  score: z.number().optional(),
});
export type FixtureFrame = z.infer<typeof FixtureFrameSchema>;

export const FixtureMetaSchema = z.object({
  subjectId: z.string(),
  gestureLabel: GestureLabel,
  distanceM: z.union([z.literal(0.5), z.literal(1.0), z.literal(1.5)]),
  palmOrientation: z.enum(['toward', 'away']),
  handedness: Handedness,
  fps: z.number(),
  source: z.string().optional(),
  recordedAt: z.string(),
  lighting: z.string().optional(),
  notes: z.string().optional(),
});
export type FixtureMeta = z.infer<typeof FixtureMetaSchema>;

export const FixtureRecordSchema = z.object({
  schema: z.literal('gesture-fixture/v0'),
  meta: FixtureMetaSchema,
  frames: z.array(FixtureFrameSchema),
});
export type FixtureRecord = z.infer<typeof FixtureRecordSchema>;
