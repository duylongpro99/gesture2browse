import { z } from 'zod';

// CursorState (arch §6): the cursor overlay's visible state, carried by
// PageCommand.pointer (ADR 0001). Single enum shared by the overlay and the relay.
export const CursorStateSchema = z.enum(['idle', 'pointing', 'snapped', 'pinch', 'drag', 'paused']);
export type CursorState = z.infer<typeof CursorStateSchema>;
