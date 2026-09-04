---
paths:
  - "apps/extension/entrypoints/background.ts"
  - "apps/extension/entrypoints/background/**"
---
# Service worker — control plane

- **May depend on:** `gesture-core`, `protocol`, `chrome.*`, `chrome.debugger`.
- **Must never:** DOM, React, MediaPipe, LLM calls, secrets in `chrome.storage.local/sync`.
- Validate every inbound Port / native message with the `protocol` Zod schema before acting on it.
- Only an event from the perception pipeline or the keyboard shortcut can `confirm` a guarded action. Nothing from the companion, side panel, or page may.
- CDP is the primary input path; content-script synthetic events are the fallback only.
