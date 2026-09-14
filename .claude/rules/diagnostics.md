# Diagnostics page — `apps/extension/entrypoints/diagnostics/**`

Full-tab page (milestone 1D.5; arch §3.2 / §3.4, modeled on grant-camera) that
surfaces live pipeline health — fps, per-stage timings, dropped-frame count — plus
the FSM transition stream and an owner-annotated false-positive log, and downloads a
`DiagnosticsExport` JSON that replays against fixtures via `gesture-core`. It reads
snapshots the service worker wrote; it renders **numbers and landmark points**, never
raw video.

- **May depend on:** React, `@gesture/protocol` (types + Zod schemas),
  `@gesture/gesture-core` (the export→replay helpers), `wxt/browser`
  (`chrome.storage`/`runtime`/`tabs`), the DOM.
- **Must never:**
  - render or retain raw video / `VideoFrame` / `ImageBitmap` — raw video lives only
    in the offscreen document (arch §1 / §6); this page draws landmark POINTS at most;
  - make network calls, or store secrets (diagnostic state is not a secret; the
    "never" is secrets in `storage.local`/`sync`);
  - contain gesture-timing logic or any gesture-timing constant — the single owner is
    `gesture-core` (CLAUDE.md §2); readouts are measurement, replay is a pure adapter;
  - produce a `confirm()` (CLAUDE.md §2; boundary-lint rule 3);
  - import `zod` directly — validate through the schemas re-exported by
    `@gesture/protocol`.
- Every blob read from `chrome.storage.session` (`pumpSeries`, `transitionSeries`,
  `falsePositiveSeries`, `diagnosticsConfig`) is re-validated with its `protocol` Zod
  schema before use, and the assembled `DiagnosticsExport` is re-validated before
  download (the page is hostile to its own stored blobs, arch §1).
- Page→SW messages are `FlagFalsePositive` and `SetRecordLandmarks` (the SW owns
  storage and the offscreen record relay); the page never writes the diagnostic
  series itself.
- Pure display/build logic (`view.ts` formatters, `export.ts` builder) stays free of
  DOM and `chrome.*` so it is unit-testable; `App.tsx` owns the I/O.
- Consumed via `package.json` `exports`; no deep imports.
