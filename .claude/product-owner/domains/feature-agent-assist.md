---
id: feature-agent-assist
title: Agent assist layer (Phase 2 LLM)
relevance: ask about the AI agent — context suggestions, natural-language goals, preview/gated execution, voice text entry, form fill; anything Phase 2
related:
  - core-product: delivers — the second value layer
  - constraint-safety: gated by — "agent proposes, human disposes" is the whole safety model
  - roadmap-phases: shipped in — Phase 2 (2A/2B/2C), not started
  - gates-feasibility: gated by — G7 latency proven GO
sources:
  - docs/01-prd.md
  - docs/02-architecture.md
---

The extension + a user-configured OpenAI-compatible LLM (**BYOK** — bring your own key). **Phase 2, not built.** Rides on the direct-control plumbing.

**Capabilities & user goals (PRD §6, FR-20..28):**
- **Context-aware suggestions** — Victory ✌️ opens a panel of 3–5 actions inferred from the page (FR-20). Turns a coarse gesture into high-level intent. Success bar: ≥ 40% suggestion acceptance.
- **Natural-language goals** (voice or text) executed as multi-step tasks with visible narration (FR-21).
- **Preview + gesture-gated execution** — every action previewed and cancellable; sensitive actions require an explicit confirming gesture (FR-22/23). The heart of [[constraint-safety]].
- **Voice text entry** (FR-26) — pinch-and-hold a field, speak, release to commit. Solves gestures' weakness at text.
- **Form filling from a local profile** — never passwords/secrets (FR-28).

**Placement (arch §3.5):** agent loop runs *inside the service worker* (`agent-core`), BYOK against any OpenAI-compatible endpoint. No local companion in the MVP (Anthropic bars subscription login in 3rd-party apps; Agent SDK bundles ~200 MB). API key confined to the service worker, never a content script.

**Feasibility:** latency proven — [[gates-feasibility]] G7 GO (p50 2.65 s < 3 s target), provider chosen.

## Open questions
- **Propose-only vs execute as the default agent mode** — provisional in 2A, finalized by 2C red-team studies. A structural safety hole reopens 2A as an ADR.
- Hosted paid tier: build or defer — waits on Phase 2 cost telemetry.
