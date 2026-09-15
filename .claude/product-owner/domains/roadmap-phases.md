---
id: roadmap-phases
title: Roadmap & sequencing
relevance: ask about phases, milestones, what ships when, M1/M2, what to do next / defer, dependencies and external waits
related:
  - gates-feasibility: sequenced by — milestones split because gate results land at different times
  - feature-direct-control: Phase 1 — the MVP milestones
  - feature-agent-assist: Phase 2 — the agent milestones
sources:
  - docs/05-roadmap.md
  - docs/STATUS.md
---

**Two releases:** **M1 developer preview** (~4 wk) and **M2 agent release** (~7–8 wk). Delivery is one owner + Claude Code, no team; milestone is the planning unit; **vertical slice first** to freeze shared contracts, then widen.

**Phases (§2.2):**
- **Phase 0 — Foundations & spike** (complete). Repo + camera-free verification harness; converted 8 feasibility gates into measurements; started participant recruiting (longest lead item).
- **Phase 1 — MVP direct control** (in progress). Maya controls a real browser by hand for 15 min — read, scroll, links, back, tabs — no mouse/keyboard. Ends at store submission = **M1**. No agent/voice/training-UI/presenter yet.
- **Phase 2 — Agent assist** (not started). Victory suggestions, thumbs-up execution, guarded-action gate, voice text fill. Ends at **M2**.
- **Phase 3 — Expansion** (ongoing, optional tracks): training UI, face/head control, hosted tier, local companion, presenter mode, WebMCP, Firefox, OS-level control.

**Phase 1 milestones (§4):**
- 1A vertical slice (interfaces frozen) · 1B perception (accuracy risk) · 1C page-plane + actions (usability risk).
- 1D.1–1D.6 = one UI screen each: **1D.5 diagnostics built first** (feeds tuning), then 1D.1 onboarding, 1D.2 calibration, 1D.3 settings, 1D.4 HUD, 1D.6 cheat-sheet + store listing.
- 1E hardening, perf CI, study-fix intake → store submission.

**Current state (STATUS.md, 2026-09-14):** Phase 0 fully merged. Phase 1: 1A + 1B merged; 1C is **next and READY**. 1D.5 diagnostics finished (PR open, owner-approved). Blockers: 1D.1–1D.6 need owner per-screen intent; 1E needs owner y4m gesture recordings + Phase-0 bench numbers.

**Sequencing risks & external waits (§1, §2.3, §9):**
- **Participant recruiting is the critical path** (2–3 wk lead). < 5 confirmed by Sep 21 → run with 3, add 2 before public launch.
- **Owner-only work is the real bottleneck** — anything verifiable only via live camera (filter tuning, cursor feel, fatigue, weak-laptop bench).
- Web Store review 5–14 days (overlaps Phase 2); store rejection risk over `<all_urls>` + optional `debugger` → fallback content-script-only build.
- Diagnostics (1D.5) intentionally shipped before tuning so "feel" issues arrive with numbers, not vibes.

## Open questions
- Public preview vs invite-only for M1 (store review). See [[gates-feasibility]] for what's still unproven before M1 is trustworthy.
