import { createInteractableIndex, createSnapper } from '@gesture/page-index';
import { PortName } from '@gesture/protocol';
import { browser } from 'wxt/browser';
import { createCursorOverlay } from './cursor-overlay';
import { type PagePlaneCtx, handlePageCommand } from './page-plane';
import { applyPageCommand, readyEvent } from './scroll';
import { syntheticClick } from './synthetic-dispatch';

// Content script — page plane (hostile environment). Connects to the service
// worker on injection, announces readiness, then executes only the PageCommands
// the SW sends (validated before acting; .claude/rules/content.md): the frozen
// 1A scroll path, plus the 1C pointer plane — cursor overlay, snapping, snapshot
// and the synthetic fallback-click. Pointer rides PageCommand.pointer over the
// SW→CS port (ADR 0001). Any answer (hover/snapshot) is posted back on the port.
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const port = browser.runtime.connect({ name: PortName.ServiceWorkerToContent });

    const index = createInteractableIndex(document);
    index.rebuild();
    const snapper = createSnapper(index);
    const overlay = createCursorOverlay(document);
    const ctx: PagePlaneCtx = {
      index,
      snapper,
      overlay,
      syntheticClick,
      viewport: window, // live, so resize is reflected in the normalized→px mapping
    };

    // 0 = top frame in 1A; per-frame ids for `all_frames` injection are 1C.
    port.postMessage(readyEvent(0));

    port.onMessage.addListener((message: unknown) => {
      // Frozen 1A scroll (ignored by handlePageCommand); then the 1C plane.
      applyPageCommand(message, window);
      const event = handlePageCommand(message, ctx);
      if (event) port.postMessage(event);
    });
  },
});
