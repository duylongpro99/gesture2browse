import { describe, expect, it, vi } from 'vitest';
import { createReinjector } from '../entrypoints/background/reinject';

// Task 7: SPA route-change content re-injection. Pure/injectable — no
// chrome.*/browser globals here (background.ts wires the real
// chrome.webNavigation listener + chrome.scripting; see reinject.ts header).

function harness(hasPort: boolean) {
  const executeScript = vi.fn(async () => {});
  const reinjector = createReinjector({
    scripting: { executeScript },
    hasContentPort: () => hasPort,
    contentScriptFiles: ['content-scripts/content.js'],
  });
  return { reinjector, executeScript };
}

describe('createReinjector', () => {
  it('re-injects when the tab has no live content port', () => {
    const { reinjector, executeScript } = harness(false);
    reinjector.onNavigationCommitted({ tabId: 12, frameId: 0, url: 'https://example.com/app#/route' });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 12 },
      files: ['content-scripts/content.js'],
    });
  });

  it('does nothing when the tab already has a live content port', () => {
    const { reinjector, executeScript } = harness(true);
    reinjector.onNavigationCommitted({ tabId: 12, frameId: 0, url: 'https://example.com/app#/route' });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('ignores sub-frame navigations', () => {
    const { reinjector, executeScript } = harness(false);
    reinjector.onNavigationCommitted({ tabId: 12, frameId: 3, url: 'https://example.com/iframe' });
    expect(executeScript).not.toHaveBeenCalled();
  });
});

describe('createReinjector.reinjectMissing (SW-startup recovery, E3)', () => {
  it('re-injects a previously-connected tab that has no live port, and skips one that has reconnected', () => {
    const executeScript = vi.fn(async () => {});
    const liveTabs = new Set([4]); // tab 4 already reconnected on its own.
    const reinjector = createReinjector({
      scripting: { executeScript },
      hasContentPort: (tabId) => liveTabs.has(tabId),
      contentScriptFiles: ['content-scripts/content.js'],
    });

    // Tabs 3 and 4 both had a content port before a simulated SW restart
    // (ports.ts's restoreState().contentTabs); only tab 3 has not reconnected.
    reinjector.reinjectMissing([3, 4]);

    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 3 },
      files: ['content-scripts/content.js'],
    });
  });

  it('does nothing when every restored tab already has a live port', () => {
    const executeScript = vi.fn(async () => {});
    const reinjector = createReinjector({
      scripting: { executeScript },
      hasContentPort: () => true,
      contentScriptFiles: ['content-scripts/content.js'],
    });

    reinjector.reinjectMissing([1, 2]);

    expect(executeScript).not.toHaveBeenCalled();
  });
});
