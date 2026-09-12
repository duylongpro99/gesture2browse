// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { syntheticClick } from '../synthetic-dispatch';

describe('syntheticClick (fallback dispatch path)', () => {
  it('fires pointerdown→mousedown→pointerup→mouseup→click, untrusted, and focuses', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    const seen: string[] = [];
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.addEventListener(type, (e) => {
        seen.push(e.type);
        // synthetic events are never trusted — the SW's CDP path is the trusted
        // one. (happy-dom leaves isTrusted undefined; a real browser sets false.)
        expect(e.isTrusted).not.toBe(true);
      });
    }
    const focusSpy = vi.spyOn(el, 'focus');
    syntheticClick(el);
    expect(seen).toEqual(['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });
});
