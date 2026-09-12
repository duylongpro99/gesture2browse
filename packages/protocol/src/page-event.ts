import { z } from 'zod';
import { A11yItemSchema, BboxSchema } from './a11y.js';

// FROZEN (1A) `ready` event. 1C adds hover/snapshot additively; none redefines
// `ready`.
export const PageEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), frameId: z.number() }), // FROZEN 1A
  z.object({ type: z.literal('hover'), id: z.number().nullable(), bbox: BboxSchema.optional() }),
  z.object({ type: z.literal('snapshot'), items: z.array(A11yItemSchema) }),
]);
export type PageEvent = z.infer<typeof PageEventSchema>;
