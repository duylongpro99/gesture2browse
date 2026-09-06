import { z } from 'zod';

// FROZEN (1A) `ready` event. hover/snapshot are added by 1C/2A; none of them
// redefines `ready`.
export const PageEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), frameId: z.number() }),
]);
export type PageEvent = z.infer<typeof PageEventSchema>;
