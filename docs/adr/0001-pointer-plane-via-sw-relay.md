# ADR 0001 — pointer plane via SW relay (PageCommand.pointer)

- **Status:** accepted (owner approved at the plan gate, 2026-09-12)
- **Date:** 2026-09-12
- **Rule broken:** `docs/02-architecture.md §3.2` design statement — "Pointer moves do not pass through the service worker: the inference Worker streams `PointerUpdate` to the content script directly" — and the `§2` diagram edge "WK → PointerUpdate @camera rate (direct runtime.Port) → CS". Not a `CLAUDE.md §1–2` hard rule nor a `.claude/rules/` line; an architecture-doc design deviation recorded under `CLAUDE.md §3` (step 4: a permanent deviation updates the architecture doc).

## Context
Milestone 1C must deliver the live pointer plane (cursor overlay + snapping + click), deferred from 1A, which reserved the `OffscreenToContent` port and noted: "offscreen lacks `chrome.tabs` → SW-brokered `MessageChannel`; ADR then if infeasible" (`docs/plans/1A-vertical-slice.md §3`, roadmap §8 2026-09-06).

The architecture's stated design — a **direct** `runtime.Port` from the inference Worker (inside the offscreen document) to a tab's content script — is not achievable in MV3:

1. An offscreen document cannot address a content script. `chrome.runtime.connect` reaches only other extension contexts (service worker, extension pages), not content scripts; reaching a content script needs `chrome.tabs.connect(tabId)`, and the offscreen document has neither `chrome.tabs` nor a tabId.
2. The "SW-brokered `MessageChannel`" fallback (SW mints a `MessageChannel`, transfers one port to offscreen and one to the content script) is also blocked: a `MessagePort` is a transferable, but `chrome.runtime`/`chrome.tabs` messaging serializes with structured clone **without** transfer support, so a port cannot be handed across the extension messaging boundary.

The perception→control loop already relays every `GestureFrame` (pointer included) from the offscreen document to the service worker each frame for the FSM (`apps/extension/entrypoints/offscreen/main.ts`, `background/fsm.ts`). The service worker therefore already holds the pointer every frame.

## Decision
Route the pointer as a new frozen `PageCommand` variant `{ type: 'pointer', x, y, state }` over the **existing** `ServiceWorkerToContent` port (frozen 1A). The service worker forwards `GestureFrame.pointer` to the active tab's content port, one coalesced message per frame. This is exactly the `PageCommand` `pointer` variant already sketched in `02-architecture §6` and the `SW → CS pointer ≤ 2 ms, coalesce to one message per frame` line already budgeted in `02-architecture §8`. No new port, no new offscreen capability. The reserved `OffscreenToContent` port stays reserved.

## Alternative rejected
The architecture-conforming **direct offscreen→content-script port** (§2/§3.2): rejected because it cannot be built in MV3 (both mechanisms above fail on a Chrome API constraint, not on effort). Continuing to pursue it would block the entire 1C pointer plane with no known implementation.

## Blast radius
- **Components:** service worker (adds pointer forwarding in the dispatcher/ports layer), content script (consumes `PageCommand.pointer` to drive the cursor overlay). Offscreen and `gesture-core` unchanged.
- **Messages:** `protocol` `PageCommand` gains the `pointer` variant (additive; `scroll` unchanged). The frozen `PortName.OffscreenToContent` constant remains, unused, reserved.
- **Perf:** one extra SW→CS message per frame at camera rate. Within the `§8` budget (already lists an SW→CS pointer message per frame); the SW already receives the frame, so no added offscreen→SW traffic.
- **Tests:** the `2A-pagecommand` contract test (this milestone) asserts the `pointer` variant; the 1C Fitts and SW-kill e2e drive the pointer through this path.

## Exit condition
Two ways this is retired or promoted:
- **Promote (on acceptance):** if the owner accepts this ADR, update `02-architecture §3.2` and the `§2` diagram to describe the SW-relayed pointer as the MV3 design, keep the direct offscreen→CS port documented as a reserved perf optimization, and this ADR becomes `accepted`. No `.claude/rules/` or lint change is needed (no rule file encodes the pointer route).
- **Retire (later perf milestone):** if pointer latency through the SW is measured to exceed the `§8` budget on a reference machine, open a follow-up milestone to implement the direct path via whatever MV3 mechanism then exists (e.g. a supported port transfer), at which point this ADR is `superseded`.
- **Who checks:** the owner at 1C PR review (accept/decline); the 1E perf CI + owner cross-laptop check (`roadmap §4.6`) confirms the SW-relay stays within budget.
