---
id: constraint-privacy
title: Privacy by construction
relevance: ask about camera/video privacy, what data leaves the device, what's persisted, the camera indicator
related:
  - core-product: structural promise — "camera frames never leave the device"
  - feature-direct-control: enforced across — the on-device layer needs no network at all
sources:
  - docs/01-prd.md
  - docs/02-architecture.md
---

A marquee, structural property (PRD §8 / arch §1 §6 §7). "Video stays in one process."

- **Camera frames never leave the device** — confined to the extension's offscreen document; never written to storage or network. Only **landmarks and gesture labels** cross process boundaries.
- **No persistence in steady state** — no frame, landmark, or screenshot is stored unless the user explicitly records custom gestures (landmarks only) or opts into diagnostics.
- **Agent sees no video** — the LLM gets an accessibility-tree snapshot + interactable index, and a screenshot only when agent features are on, only of the active tab, with no cookies/secrets.
- **Visible indicator** whenever the camera is on.
- **Offline** — direct control fully works with no network; agent features simply degrade to "unavailable."

**PO implication:** this is a primary differentiator vs cloud/computer-use agents and a Web Store trust argument. It must not erode as diagnostics ([[feature-direct-control]] tuning) and the agent are added — landmark/screenshot exit points are the places to watch.
