# 1D.5 diagnostics — progress ledger

Plan: `docs/plans/1D.5-diagnostics.md` (+ `.spec.md`, `.impl.md`). Seeded by the
plan session (session 0); execute sessions append their rows.

Task order (impl plan): 1 (protocol) → 2, 3 (offscreen, independent) → 4 (background)
→ 5 (gesture-core) → 6 (diagnostics page) → 7 (e2e). Task 1 first (interfaces
protocol-first, turns I1/I2 green); Task 5 turns I3 green. Task 6 ships the new
`.claude/rules/diagnostics.md`.

| Task | Component | Commit | State | Notes |
|---|---|---|---|---|
| 1 | protocol | — | todo | `PumpStat` += `stages`/`dropped` (additive); new `StageTimings`, `FrameSample`, `FalsePositiveEntry`, `DiagnosticsConfig`, `DiagnosticsExport`. Turns I1/I2 green. |
| 2 | offscreen | — | todo | Per-stage timings + dropped-frame count → `PumpStat`. Pure `stage-timer.ts`. |
| 3 | offscreen | — | todo | Rolling landmark buffer, record-landmarks arm/disarm (default off). Pure `landmark-buffer.ts`. |
| 4 | background | — | todo | Feature-window ring, `FalsePositiveEntry` builder, record relay, config persist. |
| 5 | gesture-core | — | todo | `framesFromDiagnostics` / `fixtureFromDiagnostics`. Turns I3 green. |
| 6 | diagnostics (new) | — | todo | Full-tab page (render/annotate/export) + `.claude/rules/diagnostics.md`. |
| 7 | extension | — | todo | Playwright e2e: render, flag, export→replay, screenshot (E1); config round-trip (E2). |

## Exit checks (frozen at plan time, see plan `## Exit checks`)

E1 owner (screenshot review), E2 mechanical (`diagnostics.e2e.ts`), I1/I2/I3
consumer:1E contract tests — all fail today; execute Tasks 1/5/6/7 make them pass.
