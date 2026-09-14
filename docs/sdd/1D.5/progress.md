# 1D.5 — SDD progress ledger

Tasks from `docs/plans/1D.5-diagnostics.impl.md`. One row per task.

| Task | Title | State | Session | Notes |
|---|---|---|---|---|
| 1 | Protocol: diagnostics shapes (additive) | DONE | exec s1 | I1/I2 contract tests PASS; commit `1b36df5` |
| 2 | Offscreen: per-stage timings + dropped-frame count | DONE | exec s1 | pure `StageTimer`; derivation split via `gesture-frame.next` out-param; commit `9982f70` |
| 3 | Offscreen: rolling landmark buffer (default OFF) | DONE | exec s2 | pure `LandmarkBuffer` ring; worker attaches `landmarks` only when armed; main.ts relays `SetRecordLandmarks`→worker, survives pump restart; commit `3f3d401` |
| 4 | Service worker: feature window, FP builder, record relay | DONE | exec s2 | pure `DiagnosticsRecorder` (FrameSample + FixtureFrame windows, `buildFalsePositive`); SW persists bounded FP series + `DiagnosticsConfig`, relays record arm/disarm; commit `2341f65` |
| 5 | gesture-core: DiagnosticsExport → replay conversion | TODO | — | turns I3 green |
| 6 | Diagnostics page (new entrypoint) + rule file | TODO | — | ships `.claude/rules/diagnostics.md` |
| 7 | e2e: render, annotate, export, screenshot | TODO | — | E1 (owner screenshot) + E2 |
