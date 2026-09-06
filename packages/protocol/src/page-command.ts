import { z } from 'zod';

// FROZEN (1A) `scroll` variant. arch §6's pointer/highlight/preview/snapshot/
// fallbackClick commands are added by 1C/2A; none of them redefines `scroll`.
export const PageCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('scroll'), dy: z.number() }),
]);
export type PageCommand = z.infer<typeof PageCommandSchema>;
