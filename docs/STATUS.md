# Status

**Read this first every session. Rewrite your own lines, never append. Keep under 60 lines.**
History lives in `docs/journal/`; decisions live in `docs/05-roadmap.md §8`; per-milestone detail lives in `docs/plans/<milestone>.md ## Status`. This file is the index.

_Project section last updated: 2026-09-12 (owner)_

## Project (owner or integration session only)

- **Phase:** 1 — Core product (`docs/05-roadmap.md §4`). Phase 0 complete.
- **Code:** Phase 0 all merged — 0A scaffold/harness/`gesture-core` v0, 0B (G1 frame pump), 0C (G2 camera grant), 0D (G5 click-dispatch survey), 0E (G7 agent latency probe). Phase 1: 1A vertical slice + 1B perception merged (PRs #7, #8). Next: **1C** page plane + actions (READY per `scripts/milestone/next`).
- **Blockers:** none for 1C. Downstream 1D.1–1D.6 need owner per-screen intent; 1E needs owner y4m gesture recordings + Phase-0 bench numbers.
- **Tooling note (2026-09-12):** 0D was rebase-merged, so its GitHub `mergeCommit` isn't on master's first-parent and `next` mis-read it as unstarted; fixed by a local `0D` marker branch at its merged tip (`9c23912`) — do not delete. `origin/0A`–`0E` are stale/diverged; ignore.
- **Decisions pending** (inputs in roadmap §8): browser inference vs ONNX-Web (G3/G8 → final 1B); real launch gesture set (G4 → realify 1B, currently MOCK); real Fitts G6 (→ realify 1C, currently MOCK); hold times (tunable).
- **Recently settled:** 2026-09-12 **G6 = GO (MOCK, fabricated to unblock 1C)** — snapping ON / snap radius 40 px / default pinch / Accessibility dwell 600 ms (`spike-results §G6`, §8); 2026-09-07 1B = browser-inference path, G4 MOCK; 2026-09-06 G1/G7/G8-provisional = GO, 1A interfaces frozen; 2026-09-05 G2 + G5 (CDP) = GO.

## Active workstreams (one row per milestone; edit only your row)

| Milestone | Owner session | State (one sentence) | Plan | Updated |
|---|---|---|---|---|
| 1C | drv-1C | Execute S5: **Task 9 done** (`[docs]` `c6841eb`) — arch §2/§3.1/§3.2/§4.1 + background/protocol rules updated for accepted **ADR 0001** (SW-relay pointer plane), per CLAUDE.md §3/§5. **All 9 tasks implemented + committed; all 8 exit-check rows PASS** (E1 precision 1.000/median 409 ms; E2; E3; I1–I5). E3 owner-accepted (answer #1=A: content-plane-reload proxy + unit coverage; literal SW-kill e2e → 1E). **Milestone ready to finish** — remaining is owner-only: merge the 1C PR (carries ADR 0001 doc update) + log roadmap §8. | `docs/plans/1C.md` | 2026-09-13 |

Claiming a row: put a short session name in "Owner session" before starting. A row already claimed means another session is on it; pick a different milestone or stop and ask. Remove the row when the milestone exits; log the exit in roadmap §8 (owner).
