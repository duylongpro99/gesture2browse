# 0001 — driving-a-milestone: post-finish should offer §8 logging + list next ready milestones

**Status:** implemented 2026-09-05 (`scripts/milestone/next`, `scripts/milestone/log-decision`, tests in `scripts/milestone/tests/post-finish.sh`; SKILL.md step 7 + precondition 4 + Resume rows; CLAUDE.md §0/§6; finish brief and plans README require the §8 row form) — awaiting owner review
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

## Proposed solution (approved 2026-09-05)

Make post-finish a **script the driver relays**, not prose the driver interprets. This keeps the skill's core rule (the driver acts on printed lines only; memory lives in `driver.json`) and fixes both items with one mechanism. A prose-only addition to the `DONE` row was rejected: it would have the driver read the roadmap and every plan in chat and compute readiness by eye, which is what produced the 0C confusion.

### 1. `scripts/milestone/next <M>`

Deterministic; prints, in order:

- `PROPOSED-8:` — the block under the plan's `## Status` headed "Proposed decision(s) for roadmap §8", verbatim, followed by the exact `| date | decision | input | result |` row to insert and which `pending` row it replaces.
- One line per unstarted milestone (no STATUS row, not merged):
  - `READY: 0D — 0A merged`
  - `BLOCKED: 0E — 0A merged; owner's API key (OWNER)`
  - `BLOCKED: 1A — G1 pending (0B); G5 pending (0D); G8 pending`

  Parsing rule for a **Plan inputs** cell: a token that is a milestone id → `git branch --merged master` (or `<id> merged`); a `G<n>` token → §8 has a non-`pending` row whose Input cell names it; anything else → `OWNER` item, printed for the owner to confirm.
- `scripts/milestone/next --inputs <M>` runs the same check for one milestone and **replaces precondition 4** in SKILL.md (currently done by eye).

### 2. Sequence the §8 write after the merge

The mid-edit race in the ticket exists only if §8 is edited before the PR lands. Post-finish order: owner merges → driver pulls `master` in the root checkout → §8 row logged and STATUS row removed in **one `[docs]` commit on master** → `next <M>` prints the ready list. (0C already did this by hand: `2a6a1d1` sits on master.)

### 3. Who writes §8

CLAUDE.md §0 and the skill's last red flag say §8 is owner-only. Chosen: add `scripts/milestone/log-decision <M> --apply`, which inserts the row from `PROPOSED-8:`, flips the matching `pending` row, removes the STATUS row, and edits nothing else. The driver runs it **only after an explicit `AskUserQuestion` approval**, recorded in `driver.json` `answers`. The same PR must amend CLAUDE.md §0, the skill's **Owner gates** line, and the red flag to read: "§8 and STATUS-row removal: owner, or the driver through `log-decision` on the owner's recorded approval". Without that doc change it is a CLAUDE.md §3 deviation. (Stricter fallback if the owner prefers: `next` prints a ready-to-paste row and the owner pastes it.)

### 4. Resume

Add a `finished` value for `driver.json` `step`: Resume re-runs the post-finish step (merge check → `log-decision` gate → `next`) instead of reporting DONE again.

### 5. SKILL.md changes

- Loop step 7 **Post-finish** with the sequence above; DONE row for `finish` ends with "→ step 7" instead of "stop".
- Precondition 4 → `scripts/milestone/next --inputs <M>`; any `pending` line → stop.
- Resume table: `finished` row.
- Owner gates / red flags: wording from §3 above.

## Notes

- Related owner-only gates already in the skill: §8 entries, removing the STATUS row after merge.
- The "next ready" logic mirrors precondition 4 (plan inputs must not read `pending`) — reuse that check across all unstarted milestones.
