import { z } from 'zod';
import { CursorStateSchema } from './cursor.js';

// FROZEN (1A) `scroll` variant. 1C adds pointer (ADR 0001), highlight, preview,
// snapshot, fallbackClick additively; none redefines `scroll`.
export const PageCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('scroll'), dy: z.number() }), // FROZEN 1A
  z.object({ type: z.literal('pointer'), x: z.number(), y: z.number(), state: CursorStateSchema }), // ADR 0001
  z.object({ type: z.literal('highlight'), ids: z.array(z.number()), label: z.string().optional() }),
  z.object({ type: z.literal('preview'), id: z.number(), label: z.string() }),
  z.object({ type: z.literal('snapshot') }),
  z.object({ type: z.literal('fallbackClick'), id: z.number() }),
]);
export type PageCommand = z.infer<typeof PageCommandSchema>;
