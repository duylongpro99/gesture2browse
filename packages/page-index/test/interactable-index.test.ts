// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createInteractableIndex, isVisible, INTERACTABLE_SELECTOR } from '@gesture/page-index';

function stubRect(el: Element, x: number, y: number, w: number, h: number): void {
  el.getBoundingClientRect = () =>
    ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON() {} }) as DOMRect;
}

describe('interactable index', () => {
  it('indexes actionable elements and assigns stable numeric ids', () => {
    document.body.innerHTML = `<button id="a">A</button><a href="#x">L</a><span>no</span>`;
    const idx = createInteractableIndex(document);
    idx.rebuild();
    const items = idx.items();
    expect(items).toHaveLength(2);
    expect(items.every((i) => typeof i.id === 'number')).toBe(true);
    const before = items.map((i) => i.id);
    idx.rebuild(); // ids stable across rebuild for the same elements
    expect(idx.items().map((i) => i.id)).toEqual(before);
    idx.dispose();
  });

  it('reports entries under a point via the grid', () => {
    document.body.innerHTML = `<button>A</button>`;
    const idx = createInteractableIndex(document);
    const el = document.querySelector('button')!;
    stubRect(el, 0, 0, 100, 40);
    idx.rebuild();
    expect(idx.at(50, 20).length).toBe(1);
    expect(idx.at(500, 500).length).toBe(0);
    idx.dispose();
  });

  it('returns candidates within a radius when at() is widened', () => {
    document.body.innerHTML = `<button>A</button>`;
    const idx = createInteractableIndex(document);
    stubRect(document.querySelector('button')!, 0, 0, 40, 20);
    idx.rebuild();
    // pointer 30px to the right of the box, radius 40 → still a candidate
    expect(idx.at(70, 10, 40).map((e) => e.bbox)).toHaveLength(1);
    expect(idx.at(200, 10, 40)).toHaveLength(0);
    idx.dispose();
  });

  it('carries role and accessible name into A11yItems', () => {
    document.body.innerHTML = `<button aria-label="Sign in">x</button>`;
    const idx = createInteractableIndex(document);
    idx.rebuild();
    expect(idx.items()[0]).toMatchObject({ role: 'button', name: 'Sign in' });
    idx.dispose();
  });

  it('filters display:none and visibility:hidden elements', () => {
    document.body.innerHTML = `<button style="display:none">H</button><a href="#">V</a>`;
    const idx = createInteractableIndex(document);
    idx.rebuild();
    expect(idx.items()).toHaveLength(1);
    idx.dispose();
  });

  it('exposes the selector and isVisible helper', () => {
    expect(INTERACTABLE_SELECTOR).toContain('button');
    document.body.innerHTML = `<button>ok</button>`;
    expect(isVisible(document.querySelector('button')!)).toBe(true);
  });
});
