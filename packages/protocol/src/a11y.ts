import { z } from 'zod';

// A11yItem (arch §6): the interactable id scheme, FROZEN by 1C and shared with 2A's
// a11y snapshot so "click element 17" is unambiguous. id is a stable-per-page-load
// number, the same id the snapping index and PageEvent.hover use; bbox = [x,y,w,h]
// CSS px.
const Bbox = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export const A11yItemSchema = z.object({
  id: z.number(),
  role: z.string(),
  name: z.string(),
  value: z.string().optional(),
  bbox: Bbox,
  state: z.array(z.string()).optional(),
});
export type A11yItem = z.infer<typeof A11yItemSchema>;
export { Bbox as BboxSchema };
