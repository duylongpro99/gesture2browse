---
id: constraint-safety
title: Safety & consent model
relevance: ask about agent safety, guarded/sensitive actions, gesture-as-consent, kill switch, domain policy, prompt injection
related:
  - feature-agent-assist: gates — safety is the condition for the agent to act
  - feature-direct-control: provides — the confirming gesture and kill switch originate here
  - core-product: structural promise — "agent never acts sensitively without a gesture"
sources:
  - docs/01-prd.md
  - docs/02-architecture.md
---

Safety is a structural product promise, not a feature (PRD §9, arch §1/§7). Principle: **the agent proposes, the human disposes** — only a gesture (or keyboard) event originating in the perception pipeline can confirm a guarded action; the agent cannot synthesize that signal.

**The bar (PRD §9):**
- **Gesture as consent** — thumbs-up-and-hold (600 ms for guarded actions; 700–800 ms confirmations) is the *only* path to a sensitive action.
- **Preview before act** — highlighted target + one-line description shown ≥ 400 ms, cancellable.
- **Least privilege** — agent limited to an allowlist of tools (observe/click/type/scroll/navigate/select_tab/propose/request_confirmation); no arbitrary JS, no filesystem.
- **Untrusted content** — page text/screenshots wrapped as data; an injection classifier forces confirmation (FR-24). Arch principle: "the page is a hostile environment."
- **Domain policy** — default deny-list for financial/health/government sites; per-site overrides (FR-25).
- **Kill switch** — open palm, keyboard shortcut, toolbar button, or closing the side panel halts the agent and detaches the debugger.
- **Secrets** — LLM API key (BYOK) confined to the service worker, never a content script; plain disclosure that extension storage is not an OS keychain.

**PO implication:** this bar is the product's trust story and the release gate for Phase 2. Red-team studies (2C) validate or reverse the propose-only default; **any unconfirmed guarded action found in red-team blocks release** and can reopen 2A as an ADR ([[feature-agent-assist]]).

## Open questions
- Propose-only vs execute default — decided by 2C red-team (see [[feature-agent-assist]]).
