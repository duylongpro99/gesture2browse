# 1D.5 — SDD progress ledger

Tasks from `docs/plans/1D.5-diagnostics.impl.md`. One row per task.

| Task | Title | State | Session | Notes |
|---|---|---|---|---|
| 1 | Protocol: diagnostics shapes (additive) | DONE | exec s1 | I1/I2 contract tests PASS; commit `1b36df5` |
| 2 | Offscreen: per-stage timings + dropped-frame count | DONE | exec s1 | pure `StageTimer`; derivation split via `gesture-frame.next` out-param; commit `9982f70` |
| 3 | Offscreen: rolling landmark buffer (default OFF) | DONE | exec s2 | pure `LandmarkBuffer` ring; worker attaches `landmarks` only when armed; main.ts relays `SetRecordLandmarks`→worker, survives pump restart; commit `3f3d401` |
| 4 | Service worker: feature window, FP builder, record relay | DONE | exec s2 | pure `DiagnosticsRecorder` (FrameSample + FixtureFrame windows, `buildFalsePositive`); SW persists bounded FP series + `DiagnosticsConfig`, relays record arm/disarm; commit `2341f65` |
| 5 | gesture-core: DiagnosticsExport → replay conversion | DONE | exec s3 | pure `framesFromDiagnostics`/`fixtureFromDiagnostics`; I3 contract PASS; commit `34c18ed` |
| 6 | Diagnostics page (new entrypoint) + rule file | DONE | exec s3 | WXT-discovered React page (`diagnostics.html`); pure `view.ts`/`export.ts`; `.claude/rules/diagnostics.md`; commit `a8d0302` |
| 7 | e2e: render, annotate, export, screenshot | DONE | exec s4 | `diagnostics.e2e.ts` (+ playwright project); E2 PASS; E1 screenshot at `apps/extension/test-results/diagnostics.png` (owner review pending); commit `pending` |
