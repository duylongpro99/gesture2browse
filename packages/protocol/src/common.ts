import { z } from 'zod';

export const Handedness = z.enum(['Left', 'Right']);
export type Handedness = z.infer<typeof Handedness>;

export const GestureLabel = z.enum([
  'none',
  'Closed_Fist',
  'Open_Palm',
  'Pointing_Up',
  'Thumb_Down',
  'Thumb_Up',
  'Victory',
  'ILoveYou',
]);
export type GestureLabel = z.infer<typeof GestureLabel>;
