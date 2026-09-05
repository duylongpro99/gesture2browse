# Status

**Read this first every session. Rewrite your own lines, never append. Keep under 60 lines.**
History lives in `docs/journal/`; decisions live in `docs/05-roadmap.md §8`; per-milestone detail lives in `docs/plans/<milestone>.md ## Status`. This file is the index.

_Project section last updated: 2026-09-04 (owner)_

## Project (owner or integration session only)

- **Phase:** 0 — Foundations & spike (`docs/05-roadmap.md §3`). Window Sep 7 → Sep 15, 2026.
- **Code:** none. Repo is docs only.
- **Blockers:** owner laptop access for gate probes 0B–0E.
- **Decisions pending** (inputs in roadmap §8): click dispatch default (G5 → 1A/1C); browser inference vs ONNX-Web (G3/G8 → 1B); launch gesture set (G4 → 1B).
- **Recently settled:** 2026-09-04 estimation model, milestone as planning unit (roadmap v0.3); 2026-09-04 doc hygiene (this file, `.claude/rules/`, plans, journal).

## Active workstreams (one row per milestone; edit only your row)

| Milestone | Owner session | State (one sentence) | Plan | Updated |
|---|---|---|---|---|
| 0A scaffold, harness, `gesture-core` v0 | drv-0A | **Finish DONE.** All 8 tasks shipped; E1 real clean-clone (install/build/test) green; `exit-check 0A` full = 6 PASS 0 FAIL, lock OK; branch pushed to `origin/0A`, CI green. Owner opens the PR to `master` themselves (compare master...0A) — no agent PR; agent does not merge. Owner then logs the §8 proposed decisions (in plan `## Status`) and removes this row on merge. | `docs/plans/0A-scaffold.md` | 2026-09-05 |
| 0C G2 camera grant probe | drv-0C | **DONE — gate met, owner approved GO (2026-09-05).** Files block shipped with TDD (`protocol` `CameraGrantStatus`, pure `permission.ts`, full-tab grant page, background `permissions.query` pre-check gate, `.claude/rules/grant-camera.md`, `camera-grant.e2e.ts`). E2 green; **E1 owner PASS** (restart survival + "Allow this time" detected); G1 unregressed. Finding: MV3 SW _can_ `permissions.query({name:'camera'})`. Proposed §8 G2=GO wording under plan `## Status` (owner logs §8). Owner: log §8 and remove this row on merge. | `docs/plans/0C-camera-grant.md` | 2026-09-05 |

Claiming a row: put a short session name in "Owner session" before starting. A row already claimed means another session is on it; pick a different milestone or stop and ask. Remove the row when the milestone exits; log the exit in roadmap §8 (owner).
