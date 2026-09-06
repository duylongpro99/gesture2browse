# 0004 — briefs: say that `docs/sdd/<M>/handoff.md` is gitignored and name the session-end commit's files

**Status:** implemented 2026-09-06 (`.claude/skills/driving-a-milestone/references/briefs.md` common header, one paragraph) — awaiting owner review
**Opened:** 2026-09-06 (remedy ticket from 0002 §Approval (d), S2 chain 1)
**Component:** `.claude/skills/driving-a-milestone/references/briefs.md` (`## Common header`, **Commit before every handoff**). No script change.
**Priority:** enhancement (removes the most frequent worker retry chain of Phase 0; not blocking Phase 1)

## Problem

11 times across 0A 0B 0C 0D 0E a worker ran `git add … docs/sdd/<M>/handoff.md && git commit …` and got:

    The following paths are ignored by one of your .gitignore files:
    docs/sdd/0E/handoff.md
    hint: Use -f if you really want to add them.

Every occurrence is the same file. With `&&` the whole line aborts (exit 1) and the session-end commit is not made; with newlines the commit goes through and the error is noise. The worker then re-runs without the path. The brief said "Commit before every handoff" and "Write `docs/sdd/<M>/handoff.md`" next to each other and never said the handoff is not a committed file, so the worker inferred it was part of the session-end writes.

## Fix (ticket 0002 §4 remedy 2: one line where the session already reads)

Remedy 1 (fix the tool) does not apply: `git add` of an ignored path cannot succeed without `-f`, and un-ignoring `handoff.md` would commit driver scratch that `spawn` archives and rewrites every session. So the common header's **Commit before every handoff** paragraph now:

1. names the session-end commit's files exactly: `docs/STATUS.md`, `docs/plans/<SLUG>.md`, `docs/journal/YYYY-MM-DD-<M>.md`, plus `docs/sdd/<M>/progress.md` or `docs/spike-results.md` when the role changed them;
2. states that `docs/sdd/<M>/handoff.md` is gitignored like every other `docs/sdd/<M>/` file except `progress.md`, that `git add` of it fails and aborts the rest of the line, and that the driver reads it from the worktree.

The text goes through `scripts/milestone/brief` unchanged (the `<SLUG>` and `<M>` placeholders are ones it already fills).

## Verification

- `scripts/milestone/brief <M> --stdout` renders the new paragraph with `<SLUG>`/`<M>` filled (checked against the 0E worktree).
- No script or test changes; the 0002 detector (when built) will show whether the chain recurs in Phase 1.
