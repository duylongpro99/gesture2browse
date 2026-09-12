// Synthetic input — the FALLBACK dispatch path (arch §3.3). The trusted path is
// the service worker's CDP `Input.dispatch*`; the content script only ever
// synthesises events, and only when the SW tells it to (`fallbackClick`). These
// events are `isTrusted === false` and cannot drive privileged UI — that is the
// point of keeping trust in the SW (.claude/rules/content.md).

type EventCtor = new (type: string, init: MouseEventInit) => Event;

// Prefer PointerEvent where the page provides it; fall back to MouseEvent.
function pointerCtor(): EventCtor {
  const w = globalThis as { PointerEvent?: EventCtor };
  return w.PointerEvent ?? MouseEvent;
}

function fire(el: Element, Ctor: EventCtor, type: string): void {
  el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, composed: true }));
}

/**
 * Synthesise a full click on `el`: the pointer/mouse event sequence a real click
 * produces, then `focus()`. `dispatchEvent` only — no synthetic-only features
 * (content.md); anything needing trust goes through the SW's CDP path.
 */
export function syntheticClick(el: Element): void {
  const Pointer = pointerCtor();
  fire(el, Pointer, 'pointerdown');
  fire(el, MouseEvent, 'mousedown');
  fire(el, Pointer, 'pointerup');
  fire(el, MouseEvent, 'mouseup');
  fire(el, MouseEvent, 'click');
  (el as HTMLElement).focus?.();
}
