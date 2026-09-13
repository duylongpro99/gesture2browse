---
paths:
  - "packages/protocol/**"
---
# `packages/protocol` — shared message types + Zod schemas

- **May depend on:** `zod` only.
- **Must never:** import any app or other package.
- Every cross-boundary shape (`GestureFrame`, `PageCommand`, `PageEvent`, `CompanionMsg`, `CompanionEvt`, `Intent`, `Action`, `Proposal`, `A11yItem`) is defined here first; both sides change after.
- Names come from `docs/02-architecture.md §6`. No synonyms.
- `PageCommand` carries the pointer plane via its `pointer` variant (`{type:'pointer',x,y,state:CursorState}`), the SW→CS route accepted in ADR 0001.
