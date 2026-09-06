import { z } from 'zod';

// FROZEN (1A). Members Arm | Pause | Scroll are final; later milestones ADD
// members only (e.g. 1C's Click/Drag), never redefine or remove these.
// Scroll.dy is signed CSS pixels: positive = scroll down.
export const IntentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Arm') }),
  z.object({ type: z.literal('Pause') }),
  z.object({ type: z.literal('Scroll'), dy: z.number() }),
]);
export type Intent = z.infer<typeof IntentSchema>;
