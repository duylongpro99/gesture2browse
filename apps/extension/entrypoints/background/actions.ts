// Browser-navigation executors (Q3, roadmap §4.3). back/forward are bound to
// swipe in the Standard profile (see dispatcher); tab-switch and zoom are
// dispatcher-CAPABLE only in 1C — no default gesture binding (1D.3 binds them).
// `chrome.tabs` is injected so this drives under vitest fakes; no DOM here.

export interface TabInfo {
  id?: number;
  index: number;
  active?: boolean;
}

export interface TabsApi {
  goBack(tabId: number): Promise<void>;
  goForward(tabId: number): Promise<void>;
  query(info: { currentWindow?: boolean }): Promise<TabInfo[]>;
  update(tabId: number, props: { active: boolean }): Promise<unknown>;
  getZoom(tabId: number): Promise<number>;
  setZoom(tabId: number, factor: number): Promise<void>;
}

export interface Actions {
  back(tabId: number): Promise<void>;
  forward(tabId: number): Promise<void>;
  /** Capability-only in 1C (no gesture binding): activate the next/prev tab. */
  selectTab(dir: 'next' | 'prev'): Promise<void>;
  /** Capability-only in 1C: multiply the tab's zoom by `delta` (clamped). */
  zoom(tabId: number, delta: number): Promise<void>;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;

export function createActions(tabs: TabsApi): Actions {
  return {
    back(tabId) {
      return tabs.goBack(tabId);
    },
    forward(tabId) {
      return tabs.goForward(tabId);
    },
    async selectTab(dir) {
      const all = (await tabs.query({ currentWindow: true })).sort((a, b) => a.index - b.index);
      if (all.length === 0) return;
      const activeIdx = Math.max(0, all.findIndex((t) => t.active));
      const step = dir === 'next' ? 1 : -1;
      const target = all[(activeIdx + step + all.length) % all.length];
      if (target?.id !== undefined) await tabs.update(target.id, { active: true });
    },
    async zoom(tabId, delta) {
      const current = await tabs.getZoom(tabId);
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current * delta));
      await tabs.setZoom(tabId, next);
    },
  };
}
