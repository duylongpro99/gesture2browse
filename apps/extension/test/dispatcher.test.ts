import type { Intent, PageCommand } from '@gesture/protocol';
import { describe, expect, it, vi } from 'vitest';
import type { Bbox } from '../entrypoints/background/cdp';
import { type DispatchCtx, type Profile, dispatchIntent } from '../entrypoints/background/dispatcher';

// Unit tests for the Intent dispatcher (1A: Scroll; 1C: the action gestures).
// No chrome.*/browser globals — the content port, CDP, nav actions, hover and
// profile are all injected fakes.

function harness(over: Partial<DispatchCtx> = {}) {
  const posted: PageCommand[] = [];
  const cdp = {
    preferCdp: vi.fn(() => false),
    trustedClick: vi.fn(async () => {}),
    trustedDrag: vi.fn(async () => {}),
    attach: vi.fn(async () => {}),
    detach: vi.fn(async () => {}),
  };
  const actions = { back: vi.fn(async () => {}), forward: vi.fn(async () => {}) };
  const ctx: DispatchCtx = {
    target: { postMessage: (c) => posted.push(c) },
    tabId: 7,
    cdp,
    actions,
    hover: () => ({ id: null }),
    profile: (): Profile => 'standard',
    ...over,
  };
  return { ctx, posted, cdp, actions };
}

describe('dispatchIntent', () => {
  it('maps a Scroll intent to the frozen 1A scroll PageCommand', async () => {
    const { ctx, posted } = harness();
    await dispatchIntent({ type: 'Scroll', dy: 42 }, ctx);
    expect(posted).toEqual([{ type: 'scroll', dy: 42 }]);
  });

  it('does nothing harmful when there is no content target', async () => {
    const { ctx } = harness({ target: null });
    await expect(dispatchIntent({ type: 'Scroll', dy: 10 }, ctx)).resolves.toBeUndefined();
  });

  it('Click uses trusted CDP when granted+attached and the hover matches', async () => {
    const bbox: Bbox = [0, 0, 100, 40];
    const { ctx, cdp, posted } = harness({ hover: () => ({ id: 17, bbox }) });
    cdp.preferCdp.mockReturnValue(true);
    await dispatchIntent({ type: 'Click', id: 17 }, ctx);
    expect(cdp.trustedClick).toHaveBeenCalledWith(7, bbox);
    expect(posted).toEqual([]); // no synthetic fallback
  });

  it('Click falls back to synthetic fallbackClick without CDP', async () => {
    const { ctx, cdp, posted } = harness({ hover: () => ({ id: 17, bbox: [0, 0, 1, 1] }) });
    cdp.preferCdp.mockReturnValue(false);
    await dispatchIntent({ type: 'Click', id: 17 }, ctx);
    expect(cdp.trustedClick).not.toHaveBeenCalled();
    expect(posted).toEqual([{ type: 'fallbackClick', id: 17 }]);
  });

  it('Swipe drives back/forward in Standard and is a no-op in Accessibility', async () => {
    const std = harness();
    await dispatchIntent({ type: 'Swipe', dir: 'left' }, std.ctx);
    await dispatchIntent({ type: 'Swipe', dir: 'right' }, std.ctx);
    expect(std.actions.back).toHaveBeenCalledWith(7);
    expect(std.actions.forward).toHaveBeenCalledWith(7);

    const acc = harness({ profile: (): Profile => 'accessibility' });
    await dispatchIntent({ type: 'Swipe', dir: 'left' }, acc.ctx);
    expect(acc.actions.back).not.toHaveBeenCalled();
  });

  it('Arm attaches and Pause detaches CDP', async () => {
    const { ctx, cdp } = harness();
    await dispatchIntent({ type: 'Arm' } as Intent, ctx);
    await dispatchIntent({ type: 'Pause' } as Intent, ctx);
    expect(cdp.attach).toHaveBeenCalledWith(7);
    expect(cdp.detach).toHaveBeenCalledWith(7);
  });
});
