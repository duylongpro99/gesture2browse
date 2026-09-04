---
paths:
  - "apps/extension/entrypoints/sidepanel/**"
---
# Side panel — human interface

- **May depend on:** React, Tailwind, Radix, `protocol`, `chrome.storage`, `chrome.runtime`.
- **Must never:** direct CDP, direct LLM calls, gesture logic, producing a `confirm`.
- Spec before code: each screen is its own milestone (1D.x) with two or three sentences of owner intent and a Playwright screenshot for review.
- No secrets in `chrome.storage`.
