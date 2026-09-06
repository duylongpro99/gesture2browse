# Status

**Read this first every session. Rewrite your own lines, never append. Keep under 60 lines.**
History lives in `docs/journal/`; decisions live in `docs/05-roadmap.md §8`; per-milestone detail lives in `docs/plans/<milestone>.md ## Status`. This file is the index.

_Project section last updated: 2026-09-05 (driver, on the owner's instruction)_

## Project (owner or integration session only)

- **Phase:** 0 — Foundations & spike (`docs/05-roadmap.md §3`). Window Sep 7 → Sep 15, 2026.
- **Code:** 0A (scaffold, harness, `gesture-core` v0), 0B (G1 frame pump), 0C (G2 camera grant) merged to `master` (PRs #1–#3, 2026-09-05). Remaining Phase 0: 0D (G5 click-dispatch survey), 0E (G7 agent latency probe).
- **Blockers:** owner laptop access for gate probes 0D–0E; owner's API key for 0E.
- **Decisions pending** (inputs in roadmap §8): §8 rows for 0A interfaces and G1 (0B) = GO not yet logged — owner writes them by hand from the plans' `## Status` (`next 0A` / `next 0B` print the proposed blocks); click dispatch default (G5 → 1A/1C); browser inference vs ONNX-Web (G3/G8 → 1B); launch gesture set (G4 → 1B).
- **Recently settled:** 2026-09-05 G2 (0C) camera grant = GO (§8); 2026-09-05 G1 (0B) frame pump gate met (`spike-results §G1`, §8 row pending); 2026-09-04 estimation model, milestone as planning unit (roadmap v0.3).

## Active workstreams (one row per milestone; edit only your row)

| Milestone | Owner session | State (one sentence) | Plan | Updated |
|---|---|---|---|---|
| 0E | drv-0E | DONE — G7 gate MET (GO): 9router, fast + planner `glm-5.2` p50 2653ms ≤3s (tool-calling Y, json_schema Y); owner chose `glm-5.2` for fast to enable tool-calling; `deepseel-v4-flash` p50 1574ms kept as json_schema-only fast alt; PR #5 → master open; §8 row drafted (owner merges PR, logs §8, removes this row) | `docs/plans/0E-agent-latency-probe.md` | 2026-09-06 |

Claiming a row: put a short session name in "Owner session" before starting. A row already claimed means another session is on it; pick a different milestone or stop and ask. Remove the row when the milestone exits; log the exit in roadmap §8 (owner).
