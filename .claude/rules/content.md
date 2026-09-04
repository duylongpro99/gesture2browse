---
paths:
  - "apps/extension/entrypoints/content/**"
---
# Content script — page plane (hostile environment)

- **May depend on:** `page-index`, `protocol`, DOM, Shadow DOM.
- **Must never:** `chrome.storage`, `chrome.debugger`, `fetch`, React or any framework, hold any secret or policy decision, execute an action not sent by the service worker.
- Treat the page as hostile: validate every `PageCommand` with the `protocol` schema; render overlay in Shadow DOM.
- `dispatchEvent` is the fallback input path. Do not add features that only work via synthetic events.
- No gesture timing here.
