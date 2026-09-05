# 0001 — driving-a-milestone: post-finish should offer §8 logging + list next ready milestones

**Status:** open
**Opened:** 2026-09-05
**Component:** `.claude/skills/driving-a-milestone/` (SKILL.md finish/DONE handling)
**Priority:** enhancement (nice-to-have; not blocking)

## Problem

On `finish DONE` the driver stops at "report the PR URL and evidence." Two owner-facing steps are left implicit and easy to forget:

1. **Logging the §8 decision.** The finish worker drafts the proposed §8 wording under the plan `## Status`, but the driver doesn't surface it or offer to log it. §8 is owner-only, so the driver can't write it unprompted — but it *can* quote the drafted row and offer to apply it at the owner's say-so.
2. **What's next.** After a milestone merges, the owner has to manually work out which milestone is now unblocked. The driver already has everything needed (roadmap plan-inputs vs §8 decisions logged, STATUS rows) to compute it.

Observed in the 0C (G2) run: the owner had to ask "what do you mean Log §8" and "what is next milestone" after the driver reported DONE.

## Proposed change

Add a **post-finish step** to the driver loop (after `finish DONE`, alongside the PR-URL report):

- **(a) Surface + offer to log §8.** Quote the drafted §8 row from the plan `## Status`. Since §8 is owner-only, offer to apply it on the owner's explicit go-ahead rather than editing silently. Handle the common race where the PR merges mid-edit (rebase the §8 commit onto the merged master).
- **(b) List next ready milestones.** Enumerate milestones whose STATUS row is unclaimed/absent and whose roadmap plan-inputs are all satisfied (every §8-decision input logged, dependency milestones merged). Flag inputs that are still missing (e.g. "0E needs owner's API key").

Keep both as *offers/reports*, not automatic writes — §8 and STATUS removal stay owner-only per CLAUDE.md §0 and the skill's owner-gates.

## Notes

- Related owner-only gates already in the skill: §8 entries, removing the STATUS row after merge.
- The "next ready" logic mirrors precondition 4 (plan inputs must not read `pending`) — reuse that check across all unstarted milestones.
