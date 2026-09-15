---
id: segment-personas
title: User personas / segments
relevance: ask when the question is about WHO the product is for, whose needs win a trade-off, or which persona a feature serves
related:
  - core-product: serves — personas define the value the spine promises
  - constraint-accessibility: sets the bar — Maya makes a11y a ship-blocker, not a nice-to-have
  - feature-direct-control: primary surface — the MVP layer these personas live in
sources:
  - docs/01-prd.md
---

Four personas (PRD §3); the MVP is built for the first.

- **Maya — motor impairment / RSI. PRIMARY for MVP.** Needs large effective targets, low fatigue, a reliable clutch/pause, zero false clicks, screen-reader compatibility. **Her accessibility constraints set the strictest bar; building for her serves everyone** ([[constraint-accessibility]]). Dwell-to-click is a first-class mode for her (can't reliably pinch).

- **Duc — hands busy** (cooking, workshop, gloves). Wants scroll / back / next-step / zoom without touching the laptop. Tolerant of poor lighting and partial hand views. Served by [[feature-direct-control]] navigation gestures.

- **Priya — presenter at 1–3 m. DEFERRED to Phase 3.** v1 operating range is ≤ 1.5 m (palm-detector limit). Not a v1 user.

- **Developer / power user** (secondary). Custom gesture training, action mapping, open architecture. Training UI is Phase 3.

**PO implication:** when a feature or ergonomics decision trades off between personas, Maya wins for MVP. "Serves everyone" is the design bet, but Maya is the acceptance judge.

## Open questions
- Participant recruiting (real users approximating these personas) is the critical path — see [[gates-feasibility]] G4/G6 and [[roadmap-phases]].
