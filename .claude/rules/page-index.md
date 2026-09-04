---
paths:
  - "packages/page-index/**"
---
# `packages/page-index` — interactable index + snapping (DOM, jsdom-testable)

- **May depend on:** DOM APIs, `gesture-core` types.
- **Must never:** `chrome.*`, network, React.
- Must run under jsdom/happy-dom; snapping behaviour is asserted by the snapping tests, not by e2e alone.
- Public API only via `exports`; no deep imports.
