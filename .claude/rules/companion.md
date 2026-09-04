---
paths:
  - "apps/companion/**"
  - "packages/agent-core/**"
---
# Companion / `agent-core` — agent plane (Phase 2)

- **May depend on:** Node 24, `protocol`, plain `fetch` to the configured `baseURL`.
- **Must never:** CDP, `chrome.*`, execute actions itself, vendor LLM SDKs, store keys outside the OS keychain.
- The agent proposes; the human disposes. It emits `Proposal`s and never a `confirm`.
- Validate every inbound `CompanionMsg` with the `protocol` schema.
