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
