import { describe, expect, it, vi } from 'vitest';
import { type TabInfo, type TabsApi, createActions } from '../entrypoints/background/actions';

function fakeTabs(tabs: TabInfo[] = [], zoom = 1): TabsApi & { updated: number[] } {
  const updated: number[] = [];
  return {
    goBack: vi.fn(async () => {}),
    goForward: vi.fn(async () => {}),
    query: vi.fn(async () => tabs),
    update: vi.fn(async (id) => {
      updated.push(id);
    }),
    getZoom: vi.fn(async () => zoom),
    setZoom: vi.fn(async () => {}),
    updated,
  };
}

describe('actions', () => {
  it('back/forward call chrome.tabs history', async () => {
    const tabs = fakeTabs();
    const actions = createActions(tabs);
    await actions.back(3);
    await actions.forward(3);
    expect(tabs.goBack).toHaveBeenCalledWith(3);
    expect(tabs.goForward).toHaveBeenCalledWith(3);
  });

  it('selectTab activates the next tab, wrapping around', async () => {
    const tabs = fakeTabs([
      { id: 10, index: 0, active: false },
      { id: 11, index: 1, active: true },
      { id: 12, index: 2, active: false },
    ]);
    const actions = createActions(tabs);
    await actions.selectTab('next');
    expect(tabs.updated).toEqual([12]);
    await actions.selectTab('prev');
    expect(tabs.updated).toEqual([12, 10]);
  });

  it('zoom multiplies and clamps', async () => {
    const tabs = fakeTabs([], 2);
    const actions = createActions(tabs);
    await actions.zoom(3, 3); // 2 * 3 = 6 → clamped to 5
    expect(tabs.setZoom).toHaveBeenCalledWith(3, 5);
  });
});
