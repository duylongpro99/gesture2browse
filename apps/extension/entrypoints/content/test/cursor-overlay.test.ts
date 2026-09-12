// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createCursorOverlay } from '../cursor-overlay';

// The overlay lives in a CLOSED shadow root, so `hostEl.shadowRoot` is null.
// Tests capture the root by spying on attachShadow (the returned object is still
// usable — closed only hides the element-side accessor).
function captureRoot() {
  const original = Element.prototype.attachShadow;
  let root: ShadowRoot | undefined;
  const spy = vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (
    this: Element,
    init: ShadowRootInit,
  ) {
    root = original.call(this, init);
    return root;
  });
  return { spy, getRoot: () => root, getInit: () => spy.mock.calls[0]?.[0] };
}

describe('cursor overlay', () => {
  it('renders into a closed shadow root and is aria-hidden / pointer-events:none', () => {
    const { spy, getInit } = captureRoot();
    const overlay = createCursorOverlay(document);
    expect(getInit()).toMatchObject({ mode: 'closed' });
    const hostEl = document.querySelector('[data-gesture-overlay]') as HTMLElement;
    expect(hostEl).not.toBeNull();
    expect(hostEl.getAttribute('aria-hidden')).toBe('true');
    expect(hostEl.style.pointerEvents).toBe('none');
    overlay.destroy();
    expect(document.querySelector('[data-gesture-overlay]')).toBeNull();
    spy.mockRestore();
  });

  it('setState toggles the state class on the cursor node', () => {
    const { spy, getRoot } = captureRoot();
    const overlay = createCursorOverlay(document);
    overlay.setState('pinch');
    const cursor = getRoot()?.querySelector('.cursor') as HTMLElement;
    expect(cursor).toBeTruthy();
    expect(cursor.classList.contains('pinch')).toBe(true);
    overlay.setState('idle');
    expect(cursor.classList.contains('pinch')).toBe(false);
    expect(cursor.classList.contains('idle')).toBe(true);
    overlay.destroy();
    spy.mockRestore();
  });

  it('moveTo positions the cursor via a transform', () => {
    const { spy, getRoot } = captureRoot();
    const overlay = createCursorOverlay(document);
    overlay.moveTo(120, 48);
    const cursor = getRoot()?.querySelector('.cursor') as HTMLElement;
    expect(cursor.style.transform).toContain('120');
    expect(cursor.style.transform).toContain('48');
    overlay.destroy();
    spy.mockRestore();
  });
});
