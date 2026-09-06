# 0002 — skill-review: a read-only observer that turns driver/worker friction into skill-improvement tickets

**Status:** proposed 2026-09-06 — awaiting owner approval (per section, see §Approval). (d) implemented 2026-09-06 as tickets 0003 (guard-scope parser) and 0004 (handoff.md never staged); (a) (b) (c) (e) still open.
**Opened:** 2026-09-06
**Component:** new `scripts/skill-review/`, new `docs/skill-review/`, new skill `.claude/skills/reviewing-the-driver/`. Touches nothing in `.claude/skills/driving-a-milestone/` or `scripts/milestone/`.
**Priority:** enhancement (not blocking Phase 1)

## Problem

Phase 0 (0A–0E) was the first run of `driving-a-milestone`. The owner had to repeat the same corrections milestone after milestone, and nothing recorded that they were repeating. Evidence from the driver-session transcripts (`~/.claude/projects/-Users-onedayin20902-personal-human-gesture*/*.jsonl`):

1. **Owner re-delegates what the driver refused.** Precondition 3 (no STATUS row) stopped the driver at 0C, 0D and 0E; each time the owner answered "you can add for me" / "you can help me do that". The gate was right once and wrong three times, and no mechanism noticed.
2. **Tool retry chains repeat across milestones.** A session runs command A, it errors, the session rewrites it (A1 … An) until it succeeds. Once is fine; the same chain in five milestones is waste and noise. Counted over all Phase 0 transcripts: 1 798 tool calls, 89 errors, 61 retry chains. Two chains recur:

   | error text (normalised) | occurrences | milestones | successful rewrite |
   |---|---|---|---|
   | `git add`: "The following paths are ignored by one of your .gitignore" | 11 | 0A 0B 0C 0D 0E | drop the ignored path, `git add` again |
   | `guard-scope.sh` false positive: "redirect into `\"`", "redirect into `{`", "redirect into `=\"`" (heredoc / quoted `=` parsed as a redirect) | 7 | 0A 0B 0D 0E | rewrite without heredoc or redirect |

3. **Post-finish confusion** (ticket 0001, fixed) and the **worktree location** fix were found the same way: by the owner noticing, not by the tooling.

The journals cannot show any of this: they record the worker's work, not the driver's stops or the owner's answers. The only driver-side record is the transcript.

## Constraints (owner, 2026-09-06)

- **Separate from the main flow.** Improvement data never goes into `driver.json`, `.claude/scope.json`, `status-N.txt`, the hooks, or any state the driver loop reads or writes. The driver, its scripts and its hooks are not changed to serve this ticket.
- **Separate sessions.** The observer runs in its own owner-invoked session, never inside the driver loop (no Loop-step hook, no Stop hook, no cron).
- **Transparent.** Every finding is a committed file quoting verbatim evidence with session id and timestamp. Every classification prints the rule it matched. Every change to a skill goes through a ticket the owner approves and a PR the owner merges. There is no `--apply`.

## Proposed solution

### 1. Inputs: read-only

`scripts/skill-review/retro <M>` reads, and never writes:

- the Claude Code transcripts of every session that touched `<M>`: the root project directory (driver sessions) **and** the per-worktree directories (`…-human-gesture--worktrees-<M>`, legacy `…-human-gesture-<M>`), because worker sessions live there;
- `docs/sdd/<M>/driver.json` and `status-*.txt` (read-only, for `N` / role / outcome to label transcript segments);
- `docs/journal/*-<M>.md`, `git log` of `scripts/milestone/` and `SKILL.md` (to date a fix against the milestones it should have affected).

### 2. Signals

Two detectors, both deterministic; a third, optional LLM pass only labels what the detectors found.

**S1 — owner re-delegation / repetition.** From the driver transcript: each assistant message that ends a turn with a stop (precondition `N` failed, `NEEDS-OWNER`, `BLOCKED`, `WARN=`, a pane dialog) paired with the owner's next message. Rule labels, printed next to the quote:
- `RE-DELEGATE` — owner's reply contains "you can", "help me", "add for me", "do it", "go ahead" after the driver said the step was owner-only;
- `REPEAT` — the owner's reply matches (normalised) a reply recorded for the same stop reason in an earlier milestone;
- `CORRECT` — "no", "adjust", "I said", "should", "instead";
- `TOOLING` — "failed to produce a valid tool call", `disconnect`, `nudge`.

**S2 — tool retry chains.** From every transcript: `tool_use` → `tool_result` with `is_error` → next `tool_use` of the same tool → first non-error result. Record `(error text normalised, A, An, tool, session, ts)`. The **grouping key is the normalised error text**, not the command: An is the fix for an error, and the same error will recur under different commands. Chains of length ≥ 2 are always recorded; length 1 is recorded but only surfaces once it repeats.

### 3. Outputs: own directory, committed

New `docs/skill-review/` (owner-owned, plain markdown, committed; nothing under `docs/sdd/`):

- `docs/skill-review/<M>.md` — the retro for one milestone: every S1 pair and S2 chain, verbatim, with session id + timestamp + matched rule. Generated; regenerating is idempotent.
- `docs/skill-review/findings.md` — cross-milestone table written by `scripts/skill-review/aggregate`: `| id | signal | key | milestones | count | evidence links | status |`. A row appears when a key repeats in **≥ 2 milestones**. `status` is one of `open` · `ticket #NNNN` · `rejected (owner, date)`; only the owner or an approved ticket changes it.
- Proposals go to `docs/tickets/` as today, one ticket per finding or per remedy, so approval has one door.

### 4. Remedies (ordered; the review proposes, the owner picks)

For S2 chains the ticket must name one of these, in this preference order:

1. **Fix the tool so A stops failing.** Zero prompt cost, benefits every session. Both recurring chains above belong here: fix the redirect parser in `scripts/hooks/guard-scope.sh` (heredoc bodies and quoted `=` are not redirects); have `spawn` list the gitignored paths inside the scope so `git add` of them is never attempted, or have the brief's commit instruction name the task's `**Files:**` block explicitly.
2. **One "known pitfall" line where the session already reads.** Worker → the role block in `references/briefs.md`; driver → `SKILL.md`; component → `.claude/rules/<component>.md`. Only when the tool cannot be fixed.
3. **Never:** a hook that silently rewrites A into An (violates transparency), or a global "lessons" file loaded into every session (context cost, drift).

For S1 findings the remedy is a **standing answer**: a gate the owner has answered the same way in ≥ 2 milestones is proposed as a one-line policy change in `CLAUDE.md §0` / `SKILL.md` **Owner gates**, following the `log-decision --apply` precedent (recorded approval once, reported thereafter instead of asked). First candidate: `claim` may seed the STATUS row.

### 5. The review session

New skill `reviewing-the-driver` (repo-local). Invoked by the owner ("review phase 0", "review 0E"). It:

1. runs `retro` for the named milestones and `aggregate`;
2. reads `findings.md` rows with `status: open`, the current `SKILL.md`, `references/briefs.md`, and the scripts a finding points at;
3. writes one ticket per finding under `docs/tickets/`, with the proposed diff **as text in the ticket**, not applied;
4. stops. It may write only under `docs/skill-review/` and `docs/tickets/`; running it through `spawn` with a `review` role would give it that allowlist and make `guard-scope.sh` enforce it (the one touch on `scripts/milestone/`; optional, see §Approval c).

Implementation of an approved ticket is an ordinary milestone-style session, not this skill.

### 6. Lifecycle of one improvement

`retro` records evidence → `aggregate` promotes to a finding at ≥ 2 milestones → review session writes a ticket with a proposed diff → owner approves → implement session → owner merges → finding `status: ticket #NNNN`. Nothing in this chain runs unless the owner starts it.

## Approval

Approve per part:

- **(a)** `scripts/skill-review/retro` + `aggregate` + `docs/skill-review/` (S1 + S2 detectors, outputs as §3).
- **(b)** skill `reviewing-the-driver` (§5, steps 1–3).
- **(c)** optional: a `review` role in `spawn` so the review session's writes are hook-enforced. This is the only change to `scripts/milestone/`; decline it and the session's allowlist is prompt-only.
- **(d)** the two remedy tickets for the recurring S2 chains (`guard-scope.sh` redirect parser; gitignored paths in `spawn`/brief), which can be opened now without waiting for (a).
- **(e)** the S1 standing answer for precondition 3 (`claim` seeds the STATUS row), as a `CLAUDE.md §0` + `SKILL.md` change.

## Estimate

- (a) 1 agent-session; (b) 1 agent-session; (c) ≤ ½ session; (d) 1 session for both; (e) ½ session.
- Owner: ~30 min per phase to read `findings.md` and approve or reject tickets.
- External wait: none.

## Notes

- Detection heuristics are deliberately simple (same tool, consecutive, `is_error`). False positives are cheap because every row carries its evidence and the owner reads the table; a missed chain costs nothing.
- Transcript paths are per machine; `retro` takes `--projects-dir` and defaults to `~/.claude/projects`.
- `docs/skill-review/` is a new directory under `docs/`, not a new top-level directory, so it is not a CLAUDE.md §4 layout deviation.
