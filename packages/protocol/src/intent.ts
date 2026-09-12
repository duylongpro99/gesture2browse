import { z } from 'zod';

// FROZEN (1A) members Arm | Pause | Scroll. 1C ADDs Click/DragStart/DragEnd/Swipe/
// HoldGesture additively, never redefining or removing the frozen members.
// Scroll.dy is signed CSS pixels: positive = scroll down.
export const IntentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Arm') }),
  z.object({ type: z.literal('Pause') }),
  z.object({ type: z.literal('Scroll'), dy: z.number() }),
  z.object({ type: z.literal('Click'), id: z.number() }),
  z.object({ type: z.literal('DragStart'), id: z.number() }),
  z.object({ type: z.literal('DragEnd') }),
  z.object({ type: z.literal('Swipe'), dir: z.enum(['left', 'right']) }),
  z.object({ type: z.literal('HoldGesture'), kind: z.enum(['Victory', 'Thumb_Up', 'Thumb_Down', 'ILoveYou']) }),
]);
export type Intent = z.infer<typeof IntentSchema>;
