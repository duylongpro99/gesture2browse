---
id: feature-direct-control
title: Direct control layer (on-device gestures)
relevance: ask about the core hands-free gestures — clutch/pause, point+snap, click, scroll, navigation, confirm/reject; the MVP's user-facing value
related:
  - core-product: delivers — the on-device value layer
  - gates-feasibility: gated by — G4 (accuracy) and G6 (ergonomics/feel) are MOCK, so quality is unproven
  - constraint-safety: uses — clutch/pause and kill switch live here
  - roadmap-phases: shipped in — Phase 1 (1A/1B/1C built; UI screens 1D in progress)
sources:
  - docs/01-prd.md
  - docs/02-architecture.md
---

The 100% on-device, no-network layer. This IS the MVP (M1). No agent, no voice.

**Gesture vocabulary & user goals (PRD §6):**
- **Clutch / pause** (open palm, hold ~1s) — arm or pause tracking; reachable from every state. Goal: trust and rest, prevents false fires. Also the kill switch ([[constraint-safety]]).
- **Point + semantic snapping** (index finger) — cursor snaps to nearest interactable within a radius. Goal: accurate selection without fine motor precision. The core "coarse gesture → precise action" bet.
- **Click** via **pinch** OR **dwell-hold** — dwell-to-click is a first-class MVP mode, default in the Accessibility profile ([[segment-personas]] Maya).
- **Scroll** (closed fist + move, inertia), **back/forward** (palm swipe L/R), **tab next/prev** (palm swipe up/down, off by default in a11y profile).
- **Confirm / reject** — thumbs-up (confirm), thumbs-down (reject/undo/dismiss).
- **Victory ✌️** — opens the agent panel (bridge to [[feature-agent-assist]]).

**Gesture acceptance rules (PRD §6, §8) — the anti-false-fire design:**
- No gesture fires until hand tracked stably ≥ 300 ms.
- Every state-changing gesture needs a hold time or velocity threshold; pointer and click are separate fingers ("Heisenberg" avoidance).
- Accuracy targets: ≥ 95% precision/recall on the canned set (indoor light); pinch false-positive < 1 / 10 min pointing; swipe false-positive < 1 / 30 min.
- Mandatory **"none" class** in the classifier trained to suppress false fires.

**Current state:** 1A vertical slice + 1B perception + (in progress) 1C page-plane/actions built. **But** built against MOCK gates — accuracy (G4) and ergonomics/feel (G6) are fabricated placeholders, so the exit criteria above are **unverified** ([[gates-feasibility]]). This is the central MVP readiness gap.

## Open questions
- Real launch gesture set (real G4) and final hold-time defaults — pending real participant data.
