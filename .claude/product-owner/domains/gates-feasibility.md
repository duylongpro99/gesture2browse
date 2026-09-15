---
id: gates-feasibility
title: Feasibility gates & the readiness risk board
relevance: ask "is this proven / ready", what's still risky before M1, the MOCK gates, hardware/accuracy/ergonomics unknowns
related:
  - roadmap-phases: sequences — gates unblock milestones as they resolve
  - feature-direct-control: gated by — G4 accuracy, G6 ergonomics
  - feature-agent-assist: gated by — G7 latency
  - constraint-performance: measured by — G1, G3, G8
sources:
  - docs/05-roadmap.md
  - docs/STATUS.md
  - docs/spike-results.md
---

Eight gates converted feasibility risk into measurements. **The honest state: the plumbing is proven; the user-experience-quality gates are not.**

| Gate | Proves | Status |
|---|---|---|
| **G1** | Frame pump ≥ 28 fps hidden | **GO** (real, 30 fps) |
| **G2** | Camera grant persists across restart | **GO** (real) |
| **G3** | Weak-laptop fps (Intel Air, Xe Win) | **PENDING** — unmeasured, deferred |
| **G4** | Launch gesture set + accuracy | **MOCK** — fabricated 6-gesture placeholder; real fixtures/participants NOT collected |
| **G5** | Click dispatch works on real sites | **GO** (real) — default = CDP trusted clicks |
| **G6** | Fitts / ergonomics (snapping, pinch vs dwell) | **MOCK** — fabricated defaults (snap ON, 40 px radius, pinch default, 600 ms dwell) |
| **G7** | Agent latency / tool-calling | **GO** (real) — p50 2.65 s < 3 s |
| **G8** | Browser inference vs ONNX-Web | **Provisional GO** (browser path); final call in 1B pending real G3 |

**The core product-readiness gap (surface this in any "ready to ship?" answer):**
- **G4 and G6 are explicitly MOCK/fabricated** — placeholders to test-drive the workflow. [[feature-direct-control]] (1B) and its ergonomics (1C) were built against these mocks, so their accuracy and feel **exit criteria are unverified**. Whether the product actually works for [[segment-personas]] Maya is not yet proven ([[constraint-accessibility]]).
- **G3 unmeasured** — mainstream-2020-laptop performance promise is unproven ([[constraint-performance]]).
- These three, plus **participant recruiting** and **Web Store review** ([[roadmap-phases]]), are the real risks between today's state and a trustworthy M1.

**Decided (roadmap §8):** delivery model; G1/G2/G5/G7 GO; provider "9router"/model "glm-5.2"; CDP trusted clicks default; 1A interfaces frozen; ADR 0001 (pointer via SW relay) accepted; G4/G6 accepted as MOCK to keep flow moving; 1C page-plane interfaces fixed; 1D.1 onboarding interfaces fixed.

**No gate readiness change through 2026-09-15.** The 1D.5 (diagnostics) and 1D.1 (onboarding) milestones both merged since discovery, but neither moved a G-number: G4/G6 remain MOCK, G3 remains unmeasured. These are UI/plumbing milestones — the accuracy/ergonomics/weak-laptop gaps are still the M1 risks and still wait on participant data. (STATUS board is now empty; merged-milestone rows removed per governance — absence is not a gate signal.)

## Open questions
- Real G4 (gesture set + accuracy) and real G6 (ergonomics) — need participant data; would supersede the mocks.
- Browser inference vs ONNX-Web on the 2020 Intel Air — waits on G3.
