import type { A11yItem } from '@gesture/protocol';
import { type Bbox, SpatialGrid } from './grid.js';
import { INTERACTABLE_SELECTOR, isVisible, nameOf, roleOf } from './selectors.js';

/** One indexed interactable element with its viewport bbox and stable numeric id. */
export interface IndexEntry {
  id: number;
  el: Element;
  bbox: Bbox;
}

export interface InteractableIndexOptions {
  /** Grid cell size in CSS px (broad-phase bucketing). */
  cellSize?: number;
  /** MutationObserver / scroll / resize rebuild debounce in ms (arch §3.3: 100). */
  debounceMs?: number;
}

export interface InteractableIndex {
  /** Re-scan the DOM, keeping ids stable for elements seen before. */
  rebuild(): void;
  /** Frozen a11y snapshot of the current index (the id scheme shared with 2A). */
  items(): A11yItem[];
  /**
   * Entries at (x, y). With `radius === 0` (default) the point must lie inside the
   * bbox; with a positive radius, entries whose bbox is within `radius` px are
   * returned (broad-phase for snapping).
   */
  at(x: number, y: number, radius?: number): IndexEntry[];
  dispose(): void;
}

const GRID_CELL = 64;
// DOM-observer coalescing interval (arch §3.3): the minimum ms between rebuilds
// triggered by mutation/scroll/resize. Not gesture timing — a DOM concern owned
// here (gesture timing lives only in gesture-core, CLAUDE.md §2).
const REBUILD_INTERVAL_MS = 100;

function rectToBbox(rect: DOMRect, ox: number, oy: number): Bbox {
  return [rect.x + ox, rect.y + oy, rect.width, rect.height];
}

/** Shortest distance from a point to a bbox (0 if inside). */
function distToBbox(x: number, y: number, [bx, by, bw, bh]: Bbox): number {
  const dx = Math.max(bx - x, 0, x - (bx + bw));
  const dy = Math.max(by - y, 0, y - (by + bh));
  return Math.hypot(dx, dy);
}

export function createInteractableIndex(
  root: Document | ShadowRoot,
  opts: InteractableIndexOptions = {},
): InteractableIndex {
  const cellSize = opts.cellSize ?? GRID_CELL;
  const debounceMs = opts.debounceMs ?? REBUILD_INTERVAL_MS;

  const ids = new WeakMap<Element, number>();
  let nextId = 1;
  let entries: IndexEntry[] = [];
  const grid = new SpatialGrid(cellSize);

  const idFor = (el: Element): number => {
    let id = ids.get(el);
    if (id === undefined) {
      id = nextId++;
      ids.set(el, id);
    }
    return id;
  };

  const collect = (
    scope: Document | ShadowRoot | Element,
    ox: number,
    oy: number,
    out: IndexEntry[],
  ): void => {
    const els = scope.querySelectorAll(INTERACTABLE_SELECTOR);
    for (const el of els) {
      if (!isVisible(el)) continue;
      out.push({ id: idFor(el), el, bbox: rectToBbox(el.getBoundingClientRect(), ox, oy) });
    }
    // Same-origin iframes contribute their children offset by the frame box;
    // cross-origin iframes are inaccessible and contribute only the frame itself.
    const frames = scope.querySelectorAll('iframe');
    for (const frame of frames) {
      if (!isVisible(frame)) continue;
      let doc: Document | null = null;
      try {
        doc = (frame as HTMLIFrameElement).contentDocument;
      } catch {
        doc = null; // cross-origin
      }
      if (!doc) continue;
      const r = frame.getBoundingClientRect();
      collect(doc, ox + r.x, oy + r.y, out);
    }
  };

  const rebuild = (): void => {
    const next: IndexEntry[] = [];
    collect(root, 0, 0, next);
    entries = next;
    grid.clear();
    for (const e of entries) grid.insert(e.id, e.bbox);
  };

  const items = (): A11yItem[] =>
    entries.map((e) => ({ id: e.id, role: roleOf(e.el), name: nameOf(e.el), bbox: e.bbox }));

  const at = (x: number, y: number, radius = 0): IndexEntry[] => {
    const r = Math.max(radius, 0);
    const candidateIds = new Set(grid.nearBox(x - r, y - r, 2 * r, 2 * r));
    const out: IndexEntry[] = [];
    for (const e of entries) {
      if (!candidateIds.has(e.id)) continue;
      if (distToBbox(x, y, e.bbox) <= r) out.push(e);
    }
    return out;
  };

  // Rebuild (debounced) on DOM mutation, scroll and resize.
  const view = (root as Document).defaultView ?? (root as ShadowRoot).ownerDocument?.defaultView ?? null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(rebuild, debounceMs);
  };

  const observer =
    typeof MutationObserver !== 'undefined'
      ? new MutationObserver(schedule)
      : null;
  observer?.observe(root as Node, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'disabled', 'href', 'role', 'tabindex'],
  });
  view?.addEventListener('scroll', schedule, true);
  view?.addEventListener('resize', schedule);

  const dispose = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    observer?.disconnect();
    view?.removeEventListener('scroll', schedule, true);
    view?.removeEventListener('resize', schedule);
    entries = [];
    grid.clear();
  };

  return { rebuild, items, at, dispose };
}
