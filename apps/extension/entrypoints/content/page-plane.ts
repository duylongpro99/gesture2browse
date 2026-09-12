import type { InteractableIndex, Snapper } from '@gesture/page-index';
import { type PageCommand, PageCommandSchema, type PageEvent } from '@gesture/protocol';
import type { CursorOverlay } from './cursor-overlay';

// Pure page-plane logic: turn an inbound (untrusted) PageCommand into overlay
// draws + snapping and, where the SW asked a question, a PageEvent answer. No
// `browser`/port and no DOM globals captured here — index.ts wires the port and
// `window` in (mirrors content/scroll.ts). No gesture timing lives here; snapping
// speed is a spatial derivative, not a gesture threshold (owner: page-index).

export interface PagePlaneCtx {
  index: InteractableIndex;
  snapper: Snapper;
  overlay: CursorOverlay;
  syntheticClick: (el: Element) => void;
  /** Viewport size, to map normalized pointer coords to CSS px. */
  viewport: { innerWidth: number; innerHeight: number };
  /** Mutable: last pointer position in CSS px, for the snapping speed estimate. */
  last?: { x: number; y: number };
}

function centerOf([bx, by, bw, bh]: [number, number, number, number]): [number, number] {
  return [bx + bw / 2, by + bh / 2];
}

/**
 * Handle one PageCommand. Validates with the Zod schema (the page is hostile),
 * then: `pointer` → snap + move the overlay, answer with a `hover`; `snapshot` →
 * answer with the index items; `highlight`/`preview` → draw; `fallbackClick` →
 * synthesise a click. Returns the PageEvent to post back, or null. The frozen 1A
 * `scroll` is handled by content/scroll.ts, so it is ignored here.
 */
export function handlePageCommand(raw: unknown, ctx: PagePlaneCtx): PageEvent | null {
  const parsed = PageCommandSchema.safeParse(raw);
  if (!parsed.success) return null;
  const cmd: PageCommand = parsed.data;
  const { index, snapper, overlay } = ctx;

  switch (cmd.type) {
    case 'pointer': {
      const x = cmd.x * ctx.viewport.innerWidth;
      const y = cmd.y * ctx.viewport.innerHeight;
      const speed = ctx.last ? Math.hypot(x - ctx.last.x, y - ctx.last.y) : 0;
      ctx.last = { x, y };
      // Latch the snapped target while pinching/dragging so a click lands on the
      // element the user aimed at, not one the pointer drifted onto.
      if (cmd.state === 'pinch' || cmd.state === 'drag') snapper.latch();
      else snapper.release();
      const snapped = snapper.snap(x, y, speed);
      const [cx, cy] = snapped ? snapped.center : [x, y];
      overlay.moveTo(cx, cy);
      overlay.setState(cmd.state);
      if (snapped) {
        const item = index.items().find((i) => i.id === snapped.id);
        return { type: 'hover', id: snapped.id, bbox: item?.bbox };
      }
      return { type: 'hover', id: null };
    }
    case 'highlight': {
      const items = index.items();
      const boxes: [number, number, number, number][] = [];
      for (const id of cmd.ids) {
        const it = items.find((i) => i.id === id);
        if (it) boxes.push(it.bbox);
      }
      overlay.highlight(cmd.ids, boxes, cmd.label);
      return null;
    }
    case 'preview': {
      const it = index.items().find((i) => i.id === cmd.id);
      if (it) overlay.preview(it.bbox, cmd.label);
      return null;
    }
    case 'snapshot':
      return { type: 'snapshot', items: index.items() };
    case 'fallbackClick': {
      const it = index.items().find((i) => i.id === cmd.id);
      if (it) {
        const [cx, cy] = centerOf(it.bbox);
        const entry = index.at(cx, cy).find((e) => e.id === cmd.id);
        if (entry) ctx.syntheticClick(entry.el);
      }
      return null;
    }
    default:
      // `scroll` (frozen 1A) is handled by content/scroll.ts.
      return null;
  }
}
