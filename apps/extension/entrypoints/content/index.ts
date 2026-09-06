import { browser } from 'wxt/browser';
import { PortName } from '@gesture/protocol';
import { applyPageCommand, readyEvent } from './scroll';

// Content script — page plane (hostile environment). Connects to the service
// worker on injection, announces readiness, then executes only the
// PageCommands the SW sends (validated before acting; .claude/rules/content.md).
// Cursor overlay (1C) and input dispatch (1D.1) fill this in further.
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const port = browser.runtime.connect({ name: PortName.ServiceWorkerToContent });

    // 0 = top frame in 1A; per-frame ids for `all_frames` injection are 1C.
    port.postMessage(readyEvent(0));

    port.onMessage.addListener((message: unknown) => {
      applyPageCommand(message, window);
    });
  },
});
