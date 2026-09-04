---
paths:
  - "packages/gesture-core/**"
---
# `packages/gesture-core` — perception features + FSM (pure TS)

- **May depend on:** pure TS, `xstate`, `zod`.
- **Must never:** touch DOM, `chrome.*`, `fetch`, or timers outside XState.
- All gesture timing, hysteresis, cooldowns, and confidence gating live in the XState machine here and nowhere else.
- Threshold or filter changes are incomplete without a fixture replay (`fixtures/gestures/`).
- Public API only via `exports` in `package.json`; no deep imports from other packages.
