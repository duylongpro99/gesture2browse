import type { CursorState } from '@gesture/protocol';

// Cursor overlay — the only thing the page plane draws. Lives in a CLOSED shadow
// root so the hostile page cannot read or restyle it (.claude/rules/content.md),
// is `aria-hidden` and `pointer-events:none` so it never intercepts input or the
// a11y tree, and sits at the top z-index. It renders no video and holds no state
// beyond what it is told to draw.

export interface CursorOverlay {
  /** Reflect the FSM/cursor state as a class (drives the visible cursor style). */
  setState(state: CursorState): void;
  /** Position the cursor at viewport CSS px (x, y). */
  moveTo(x: number, y: number): void;
  /** Outline the given interactable boxes (observe/confirm candidates, 2A). */
  highlight(ids: number[], boxes: [number, number, number, number][], label?: string): void;
  /** Show a single labelled preview box (2A's proposal preview). */
  preview(box: [number, number, number, number], label: string): void;
  destroy(): void;
}

const MAX_Z = 2147483647;

const STYLE = `
  :host { all: initial; }
  .cursor {
    position: fixed; left: 0; top: 0; width: 24px; height: 24px;
    margin-left: -12px; margin-top: -12px;
    border: 2px solid #1a73e8; border-radius: 50%;
    background: rgba(26, 115, 232, 0.15);
    will-change: transform; transition: background 80ms, border-color 80ms;
  }
  .cursor.snapped { background: rgba(26, 115, 232, 0.35); }
  .cursor.pinch { border-color: #d93025; background: rgba(217, 48, 37, 0.35); }
  .cursor.drag { border-color: #d93025; border-style: dashed; }
  .cursor.paused { opacity: 0.35; }
  .box { position: fixed; box-sizing: border-box; border: 2px solid #1a73e8; border-radius: 4px; pointer-events: none; }
  .preview { position: fixed; box-sizing: border-box; border: 2px solid #188038; border-radius: 4px; }
  .preview-label, .box-label {
    position: fixed; font: 12px/1.4 system-ui, sans-serif; color: #fff;
    background: #188038; padding: 1px 6px; border-radius: 3px; white-space: nowrap;
  }
  @media (prefers-contrast: more) {
    .cursor, .box, .preview { border-width: 3px; }
  }
`;

const STATES: CursorState[] = ['idle', 'pointing', 'snapped', 'pinch', 'drag', 'paused'];

export function createCursorOverlay(host: Document): CursorOverlay {
  const hostEl = host.createElement('div');
  hostEl.setAttribute('data-gesture-overlay', '');
  hostEl.setAttribute('aria-hidden', 'true');
  hostEl.style.cssText = `position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:${MAX_Z};`;

  const root = hostEl.attachShadow({ mode: 'closed' });
  const style = host.createElement('style');
  style.textContent = STYLE;
  const cursor = host.createElement('div');
  cursor.className = 'cursor idle';
  const highlightLayer = host.createElement('div');
  const previewLayer = host.createElement('div');
  root.append(style, cursor, highlightLayer, previewLayer);

  (host.documentElement ?? host.body).appendChild(hostEl);

  const setState = (state: CursorState): void => {
    cursor.classList.remove(...STATES);
    cursor.classList.add(state);
  };

  const moveTo = (x: number, y: number): void => {
    // The relay coalesces to one pointer message per frame (ADR 0001), so the
    // overlay writes the transform directly — no extra rAF batching needed.
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const place = (el: HTMLElement, [bx, by, bw, bh]: [number, number, number, number]): void => {
    el.style.left = `${bx}px`;
    el.style.top = `${by}px`;
    el.style.width = `${bw}px`;
    el.style.height = `${bh}px`;
  };

  const highlight = (
    _ids: number[],
    boxes: [number, number, number, number][],
    label?: string,
  ): void => {
    highlightLayer.replaceChildren();
    for (const box of boxes) {
      const b = host.createElement('div');
      b.className = 'box';
      place(b, box);
      highlightLayer.appendChild(b);
    }
    if (label && boxes[0]) {
      const l = host.createElement('div');
      l.className = 'box-label';
      l.textContent = label;
      l.style.left = `${boxes[0][0]}px`;
      l.style.top = `${boxes[0][1]}px`;
      highlightLayer.appendChild(l);
    }
  };

  const preview = (box: [number, number, number, number], label: string): void => {
    previewLayer.replaceChildren();
    const b = host.createElement('div');
    b.className = 'preview';
    place(b, box);
    const l = host.createElement('div');
    l.className = 'preview-label';
    l.textContent = label;
    l.style.left = `${box[0]}px`;
    l.style.top = `${box[1]}px`;
    previewLayer.append(b, l);
  };

  const destroy = (): void => {
    hostEl.remove();
  };

  return { setState, moveTo, highlight, preview, destroy };
}
