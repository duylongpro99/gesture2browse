---
id: constraint-performance
title: Performance & hardware bar
relevance: ask about fps, latency budgets, low-end/weak laptop support, resource use, whether it feels responsive
related:
  - gates-feasibility: measured by — G1 (fps GO), G3 (weak hardware, unmeasured), G8 (inference path)
  - roadmap-phases: gates — G3 result can add sessions to 1B
  - core-product: success metric — ≥ 30 fps is a headline number
sources:
  - docs/01-prd.md
  - docs/02-architecture.md
---

Responsiveness is a product requirement, not a stretch goal (PRD §8, arch §8). The whole architecture ("two loops, two speeds") exists to hit it.

**Budgets:**
- Inference ≤ 15 ms/frame (WebGL) / ≤ 40 ms (WASM-SIMD CPU).
- Camera-to-cursor added latency ≤ 50 ms; gesture→action ≤ 150 ms.
- First agent suggestion ≤ 3 s p50 / ≤ 6 s p95.
- Cursor render 60–120 Hz.

**Throughput / hardware targets:**
- ≥ 30 fps on Apple Silicon / 11th-gen Xe; ≥ 20 fps on a 2020 Intel MacBook Air.
- ≤ 25% of one CPU core steady state; ≤ 400 MB memory; no page main-thread jank.
- Robustness: recovers within 500 ms after hand re-enters frame; degrades gracefully in low light.

**Status ([[gates-feasibility]]):** G1 frame pump **GO** (30 fps). But **G3 (weak-laptop fps: Intel Air, Xe Windows) is UNMEASURED** — bench deferred. If the Intel Air comes in under 20 fps it triggers the ONNX-Web fallback path into 1B (+4–6 sessions) or a relaxed 15 fps dwell-only mode. G8 (browser inference vs ONNX-Web) is provisional-GO for the browser path; final call waits on real G3 numbers.

**PO implication:** low-end hardware is an open product risk — the extension promises mainstream-2020-laptop support but hasn't proven it. Needs owner bench time on the two weak laptops (owner-only, can't be agent-run).
