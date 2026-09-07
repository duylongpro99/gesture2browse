# Gate verification guides (owner-run)

One file **per milestone**, covering the gate(s) that milestone is blocked on — the
work only the owner can produce (real people in front of a real camera). Each guide says
exactly what to do, what tool to use, and **where to put the result** so the milestone unblocks.

| Milestone | Gate needed | Owner effort | Tooling ready? | Guide |
|---|---|---|---|---|
| **1B** perception | **G4** — gesture fixtures (precision/recall) | ~8–10 h full; **your own subset** is enough to *start* 1B | Recorder exists but can't tag recordings (guide §Prerequisite) | [1B.md](1B.md) |
| **1C** page plane & actions | **G6** — Fitts task (ergonomics) | ~2 h | **No Fitts harness yet — must be built first** (agent task) | [1C.md](1C.md) |

Add a new `docs/verification/<milestone>.md` when a future milestone is blocked on an
owner-only gate.

## How a gate "unblocks" a milestone

`scripts/milestone/next --inputs <M>` treats a gate as **logged** only when a **dated
(non-pending) row in roadmap §8** names it in its *Input* cell. Recording the data and
filling `docs/spike-results.md` is not enough on its own — the last step of each guide is
**logging the §8 decision** (converting the `| — | … | pending |` row into a dated one).
Until then the milestone stays `BLOCKED`.

State on 2026-09-06: `1B` needs G4; `1C` needs G6. Everything else for those two is already
satisfied (1A merged; G3, G5 logged).

## The result lands in three places

1. **Raw data** — fixtures into `fixtures/gestures/` (G4); the trial numbers (G6).
2. **`docs/spike-results.md`** — the gate section (`## G4` / `## G6`): *Setup*, *Result (numbers)*, *Gate met? (Y/N)*.
3. **Roadmap §8 + `docs/03-tech-stack.md §4`** — the decision row (owner-only §8 write) and the tuned numbers.
