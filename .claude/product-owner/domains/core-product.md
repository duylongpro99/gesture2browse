---
id: core-product
title: Core product spine
relevance: ask for almost anything — the problem, who it's for, the value, how success is measured, what's out of scope
related:
  - segment-personas: serves — Maya is the primary user the bar is set by
  - feature-direct-control: delivers — the on-device value layer
  - feature-agent-assist: delivers — the Phase 2 value layer
  - feature-onboarding: activates — the install→first-use path; leading indicator for the day-7 retention metric
  - gates-feasibility: gated by — readiness rests on unproven G4/G6
sources:
  - docs/01-prd.md
  - docs/05-roadmap.md
---

**Problem.** Operating the web hands-free is still poor. Voice is slow for spatial "click that" tasks; existing gesture tools are OS-level cursor emulators blind to the page (demand pixel-precise pointing → fatigue, errors); browser agents are text/voice driven with no low-latency way for a human to steer and approve.

**Thesis.** Gestures are great for *pointing, selecting, confirming* and bad for everything else. An LLM browser agent fills the gap; in return, gestures give the agent a fast, unambiguous human-in-the-loop signal. Two cooperating layers: [[feature-direct-control]] (100% on-device) and [[feature-agent-assist]] (Phase 2, BYOK LLM).

**Value proposition.** Trustworthy, low-fatigue hands-free browsing with an ordinary webcam. Coarse gestures become precise actions because the agent understands the page (semantic snapping — pointing need not be pixel-precise). Two structural promises: the agent never performs a sensitive action without an explicit confirming gesture ([[constraint-safety]]), and camera frames never leave the device ([[constraint-privacy]]). Privacy and safety are structural, not features.

**Delivery model (unusual, drives everything).** One owner directing Claude Code, **no engineering team**. Two named releases: **M1 developer preview** (~4 wk out) and **M2 agent release** (~7–8 wk). The owner is the bottleneck for anything only verifiable with a live camera.

**Success metrics (PRD §10).**
- Target acquisition ≤ 1.8 s median (40 px targets, with snapping).
- Click precision ≥ 95% correct target (snapping on).
- False activations < 1 unintended discrete action / 10 min.
- Sustained session ≥ 15 min without fatigue-stop, 8 of 10 testers.
- Inference ≥ 30 fps on reference laptops ([[constraint-performance]]).
- Agent suggestion acceptance ≥ 40% (Phase 2).
- Retention: 50% of installers still enabling tracking after 7 days.

**Non-goals v1 (PRD §4).** OS-level cursor control outside the browser; sign-language recognition; two-handed / full-body gestures; mobile browsers; fully autonomous unattended agent tasks; non-Chromium browsers (Firefox is Phase 3); presenter persona / range > 1.5 m (Phase 3).

## Open questions
- Public developer preview vs invite-only for M1 — waits on Web Store review.
