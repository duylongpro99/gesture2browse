// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  createInteractableIndex,
  createSnapper,
  SNAP_NEIGHBOUR_MARGIN_PX,
  SNAP_RADIUS_PX,
  SNAP_SPEED_CUTOFF,
} from '@gesture/page-index';

function stubRect(el: Element, x: number, y: number, w: number, h: number): void {
  el.getBoundingClientRect = () =>
    ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON() {} }) as DOMRect;
}

/** Index with A at [0,0,40,20] and B at [100,0,40,20]. */
function twoTargets() {
  document.body.innerHTML = `<button id="A">A</button><button id="B">B</button>`;
  stubRect(document.getElementById('A')!, 0, 0, 40, 20);
  stubRect(document.getElementById('B')!, 100, 0, 40, 20);
  const idx = createInteractableIndex(document);
  idx.rebuild();
  const idA = idx.items().find((i) => i.name === 'A')!.id;
  const idB = idx.items().find((i) => i.name === 'B')!.id;
  return { idx, idA, idB };
}

describe('snapping', () => {
  it('snaps to the nearest visible entry within the radius', () => {
    const { idx, idA } = twoTargets();
    const snapper = createSnapper(idx);
    const r = snapper.snap(20, 10, 0);
    expect(r?.id).toBe(idA);
    expect(r?.center).toEqual([20, 10]);
    idx.dispose();
  });

  it('returns null above the speed cutoff (no snap while moving fast)', () => {
    const { idx } = twoTargets();
    const snapper = createSnapper(idx);
    expect(snapper.snap(20, 10, SNAP_SPEED_CUTOFF + 1)).toBeNull();
    idx.dispose();
  });

  it('returns null when no entry is within the radius', () => {
    const { idx } = twoTargets();
    const snapper = createSnapper(idx);
    expect(snapper.snap(300, 300, 0)).toBeNull();
    idx.dispose();
  });

  it('holds the current target through hysteresis — one clean transition, no flicker', () => {
    const { idx, idA, idB } = twoTargets();
    const snapper = createSnapper(idx);
    const ids: (number | null)[] = [];
    for (let x = 20; x <= 120; x += 2) ids.push(snapper.snap(x, 10, 0)?.id ?? null);
    // starts on A, ends on B, exactly one A→B transition, never flips back
    expect(ids[0]).toBe(idA);
    expect(ids[ids.length - 1]).toBe(idB);
    const transitions = ids.filter((v, i) => i > 0 && v !== ids[i - 1]).length;
    expect(transitions).toBe(1);
    expect(ids.lastIndexOf(idA)).toBeLessThan(ids.indexOf(idB));

    // at the flip, B beats A by more than the hysteresis margin
    const flip = ids.indexOf(idB);
    const xFlip = 20 + flip * 2;
    const dA = Math.max(0 - xFlip, 0, xFlip - 40); // dist to A box on the x axis (y inside)
    const dB = Math.max(100 - xFlip, 0, xFlip - 140);
    expect(dA - dB).toBeGreaterThan(SNAP_NEIGHBOUR_MARGIN_PX);
    idx.dispose();
  });

  it('latch() freezes the id until release()', () => {
    const { idx, idA } = twoTargets();
    const snapper = createSnapper(idx);
    expect(snapper.snap(20, 10, 0)?.id).toBe(idA);
    snapper.latch();
    // pointer wanders far away, but the latched id stays
    expect(snapper.snap(300, 300, 5)?.id).toBe(idA);
    snapper.release();
    expect(snapper.snap(300, 300, 0)).toBeNull();
    idx.dispose();
  });

  it('exposes the spatial tunables', () => {
    expect(SNAP_RADIUS_PX).toBe(40);
    expect(SNAP_SPEED_CUTOFF).toBeGreaterThan(0);
    expect(SNAP_NEIGHBOUR_MARGIN_PX).toBeGreaterThan(0);
  });
});
