---
discovered: 2026-09-14
updated: 2026-09-15
base_commit: cbb09ad
last_checked: 2026-09-15
head_at_check: cbb09ad
status: fresh
sources:
  - docs/01-prd.md
  - docs/02-architecture.md
  - docs/05-roadmap.md
  - docs/STATUS.md
  - docs/spike-results.md
  - docs/plans/1D.1-onboarding.md
---

## Drift signals
<!-- rewritten by every drift check; "none" when fresh -->
- roadmap-phases: 1D.1 onboarding merged; roadmap+STATUS reconciled — [reconciled 2026-09-15]
- gates-feasibility: STATUS churn reviewed — no gate moved by 1D.5/1D.1 — [reconciled 2026-09-15]
- feature-onboarding: new chunk created for the shipped first-run wizard — [reconciled 2026-09-15]
- PRD FR-30 vs shipped onboarding (tutorial + pinch calibration promised, not shipped) — [OPEN drift risk; owner reconciles PRD]

## Chunks
- [[core-product]] — the problem, users, value, two-layer model, success metrics, non-goals (read for almost anything)
- [[segment-personas]] — who it's for; Maya is the primary MVP user and the acceptance judge
- [[feature-direct-control]] — the on-device gesture layer = the MVP (clutch, point+snap, click, scroll, nav, confirm)
- [[feature-onboarding]] — first-run wizard (1D.1): consent→camera→site→profile→ready; activation; what first-run does NOT teach
- [[feature-agent-assist]] — the Phase 2 LLM agent (suggestions, NL goals, gated execution, voice)
- [[constraint-safety]] — agent proposes/human disposes; gesture-as-consent, kill switch, domain policy, injection
- [[constraint-privacy]] — video never leaves the device; landmarks only; offline-capable
- [[constraint-performance]] — fps, latency budgets, weak-laptop bar (G3 unmeasured)
- [[constraint-accessibility]] — screen-reader + keyboard escape hatch; ship-blocker because of Maya
- [[roadmap-phases]] — phases, milestones, M1/M2, what's next, external waits and critical path
- [[gates-feasibility]] — the readiness risk board; G4/G6 are MOCK, G3 unmeasured — the real gaps before M1
