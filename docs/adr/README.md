# Architecture Decision Records

One line per ADR. Read this index, then open only the ADR you need.

| ID | Title | Status | Rule broken | Exit condition |
|---|---|---|---|---|
| — | (none yet) | | | |

Template: `0000-template.md`. Statuses: `proposed` (agent drafted, owner has not decided), `accepted`, `superseded`, `retired`.

## Process (`CLAUDE.md §3`)

Breaking a rule in `CLAUDE.md §1–2` or a `.claude/rules/<component>.md` is sometimes the right trade-off. It is never the default.

1. **Prove necessity first.** Show that the architecture-conforming approach was attempted or reasoned through and fails on a concrete requirement: a measured performance budget from `docs/02-architecture.md §8`, a Chrome API constraint, a security property. "Faster to write" or "simpler for this ticket" is not necessity.
2. **Prefer the smallest deviation.** A local, contained exception behind the existing interface beats a change to the interface, which beats a change to component ownership.
3. **Record it before merging.** Add `docs/adr/NNNN-<slug>.md` from the template with: context, the rule being broken, the alternative that was rejected and why, the blast radius, and an exit condition (when and how it gets removed or promoted into the architecture). Reference the ADR id in the code comment at the deviation site and in the PR. Add the row above.
4. **Update the guardrail, not just the code.** If the deviation is permanent, update `docs/02-architecture.md`, `CLAUDE.md`, and the lint / dependency / `.claude/rules/` files so the new shape is enforced. A rule that is broken in one place and enforced elsewhere is the worst state.
5. **The human decides.** An agent may propose a deviation with the ADR drafted (`proposed`); it does not merge one on its own judgement. Working autonomously: finish everything that does not depend on the deviation, leave the draft, stop.

Not deviations, just bugs (refuse outright): secrets in the content script or `chrome.storage`; the companion or side panel triggering an action without an FSM `confirm`; video or landmarks leaving the offscreen document in steady state; a second place that decides gesture timing; bypassing Zod validation on a boundary "because the sender is ours".
