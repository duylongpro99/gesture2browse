// @vitest-environment happy-dom
import { createInteractableIndex, createSnapper } from '@gesture/page-index';
import { describe, expect, it, vi } from 'vitest';
import { type PagePlaneCtx, handlePageCommand } from '../page-plane';

function stubRect(el: Element, x: number, y: number, w: number, h: number): void {
  el.getBoundingClientRect = () =>
    ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON() {} }) as DOMRect;
}

function ctx(): { ctx: PagePlaneCtx; overlay: Record<string, ReturnType<typeof vi.fn>>; click: ReturnType<typeof vi.fn>; buttonId: number; el: HTMLButtonElement } {
  document.body.innerHTML = '<button>A</button>';
  const el = document.querySelector('button') as HTMLButtonElement;
  stubRect(el, 0, 0, 100, 40); // centre (50, 20)
  const index = createInteractableIndex(document);
  index.rebuild();
  const first = index.items()[0];
  if (!first) throw new Error('expected one indexed interactable');
  const buttonId = first.id;
  const snapper = createSnapper(index);
  const overlay = {
    setState: vi.fn(),
    moveTo: vi.fn(),
    highlight: vi.fn(),
    preview: vi.fn(),
    destroy: vi.fn(),
  };
  const click = vi.fn();
  return {
    ctx: { index, snapper, overlay: overlay as never, syntheticClick: click, viewport: { innerWidth: 1000, innerHeight: 1000 } },
    overlay,
    click,
    buttonId,
    el,
  };
}

describe('handlePageCommand', () => {
  it('pointer over a target returns a hover event with the snapped id and moves the overlay', () => {
    const { ctx: c, overlay, buttonId } = ctx();
    // normalized (0.05, 0.02) → px (50, 20) = the button centre
    const ev = handlePageCommand({ type: 'pointer', x: 0.05, y: 0.02, state: 'snapped' }, c);
    expect(ev).toMatchObject({ type: 'hover', id: buttonId, bbox: [0, 0, 100, 40] });
    expect(overlay.moveTo).toHaveBeenCalledWith(50, 20);
    expect(overlay.setState).toHaveBeenCalledWith('snapped');
  });

  it('pointer over empty space returns hover id null', () => {
    const { ctx: c } = ctx();
    const ev = handlePageCommand({ type: 'pointer', x: 0.9, y: 0.9, state: 'pointing' }, c);
    expect(ev).toEqual({ type: 'hover', id: null });
  });

  it('snapshot returns the index items', () => {
    const { ctx: c, buttonId } = ctx();
    const ev = handlePageCommand({ type: 'snapshot' }, c);
    expect(ev).toMatchObject({ type: 'snapshot', items: [{ id: buttonId, role: 'button', bbox: [0, 0, 100, 40] }] });
  });

  it('fallbackClick synthesises a click on the element with that id', () => {
    const { ctx: c, click, buttonId, el } = ctx();
    const ev = handlePageCommand({ type: 'fallbackClick', id: buttonId }, c);
    expect(ev).toBeNull();
    expect(click).toHaveBeenCalledWith(el);
  });

  it('highlight and preview drive the overlay and return null', () => {
    const { ctx: c, overlay, buttonId } = ctx();
    expect(handlePageCommand({ type: 'highlight', ids: [buttonId], label: 'x' }, c)).toBeNull();
    expect(overlay.highlight).toHaveBeenCalledWith([buttonId], [[0, 0, 100, 40]], 'x');
    expect(handlePageCommand({ type: 'preview', id: buttonId, label: 'Open' }, c)).toBeNull();
    expect(overlay.preview).toHaveBeenCalledWith([0, 0, 100, 40], 'Open');
  });

  it('ignores an invalid command and the frozen 1A scroll (handled elsewhere)', () => {
    const { ctx: c, overlay } = ctx();
    expect(handlePageCommand({ type: 'bogus' }, c)).toBeNull();
    expect(handlePageCommand({ type: 'scroll', dy: 100 }, c)).toBeNull();
    expect(overlay.moveTo).not.toHaveBeenCalled();
  });
});
