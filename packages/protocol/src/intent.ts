import { z } from 'zod';

// PROVISIONAL v0 — 1A finalizes/extends. Do not treat as frozen.
export const IntentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Arm') }),
  z.object({ type: z.literal('Pause') }),
  z.object({ type: z.literal('Scroll'), dy: z.number() }),
]);
export type Intent = z.infer<typeof IntentSchema>;
