---
id: constraint-accessibility
title: Accessibility bar
relevance: ask whether the product is usable for the disabled primary user, screen-reader compatibility, keyboard escape hatch, high-contrast cursor
related:
  - segment-personas: set by — Maya (primary MVP persona) makes a11y a ship-blocker
  - feature-direct-control: applies to — dwell-click, cursor overlay, profiles
  - feature-onboarding: enforced by — first-run defaults to the Accessibility profile and ships a full keyboard + screen-reader path
sources:
  - docs/01-prd.md
  - docs/02-architecture.md
---

Accessibility is a first-class acceptance bar because the PRIMARY MVP user (Maya, [[segment-personas]]) has a motor impairment. "Build for Maya, serve everyone."

**The bar (PRD §8):**
- Screen-reader compatible — cursor overlay is `aria-hidden`; HUD announcements go through an ARIA live region.
- High-contrast cursor with distinct visual states.
- **Every feature reachable via keyboard** — a non-gesture escape hatch (FR-16). Gestures must never be the *only* path.
- **Dwell-to-click** is first-class (default in the Accessibility profile) for users who can't pinch ([[feature-direct-control]]).
- Accessibility profile turns off error-prone gestures (e.g. tab-swipe off by default) and favors larger targets / snapping. **As of 1D.1 this is real, not aspirational:** first-run defaults to Accessibility and the profile now actually governs behaviour (dwell-click on), and onboarding itself ships a full keyboard + screen-reader path ([[feature-onboarding]]).

**PO implication:** this is inseparable from the product's reason to exist — an accessibility regression is not a polish bug, it's a mission failure. Ties directly to G6 ergonomics ([[gates-feasibility]]), still MOCK, so "does it actually work for Maya" is unverified until real participant studies.
