import { z } from 'zod';
import { IntentSchema } from './intent.js';

// Event-sourced FSM log entry for diagnostics (1D.5) and replay tests (arch §3.2).
export const TransitionLogEntrySchema = z.object({
  ts: z.number(),
  from: z.string(),
  to: z.string(),
  event: z.string(),
  intent: IntentSchema.optional(),
});
export type TransitionLogEntry = z.infer<typeof TransitionLogEntrySchema>;
