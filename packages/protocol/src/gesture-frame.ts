import { z } from 'zod';
import { Handedness, GestureLabel } from './common.js';

export const GestureFrameSchema = z.object({
  ts: z.number(),
  present: z.boolean(),
  handedness: Handedness.optional(),
  gesture: GestureLabel.optional(),
  score: z.number(),
  pinch: z.number(),
  fingers: z.tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean(), z.boolean()]),
  velocity: z.object({ vx: z.number(), vy: z.number() }),
  scale: z.number(),
  pointer: z.object({ x: z.number(), y: z.number() }),
  landmarks: z.array(z.number()).length(63).optional(),
});
export type GestureFrame = z.infer<typeof GestureFrameSchema>;
