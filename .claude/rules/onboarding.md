# Onboarding page — `apps/extension/entrypoints/onboarding/**`

Full-tab first-run wizard (milestone 1D.1; arch §3.4, modeled on `grant-camera` /
`diagnostics`) that takes a developer-preview user from install to "I can point and
click" with informed consent, in the fewest steps: consent/privacy → camera-grant
handoff (0C) → site access → profile (default Accessibility) → "you're ready." It
renders **status text and controls**, never video: capture and the persistent grant
stay in `grant-camera` (0C); onboarding reads only device *kind* and permission
*state* and delegates the actual grant to that page.

- **May depend on:** React, `@gesture/protocol` (types + Zod schemas), `wxt/browser`
  (`storage` local+sync / `runtime` / `tabs` / `permissions` / `sidePanel`),
  `navigator.mediaDevices.enumerateDevices` + `navigator.permissions` (readouts
  only), the DOM.
- **Must never:**
  - call `getUserMedia`, or render/retain video / `VideoFrame` / `ImageBitmap` — raw
    video lives only in the offscreen document (arch §1 / §6); the actual grant is
    `grant-camera`'s job and this page only reads device kind + permission state;
  - make network calls, or store secrets (a profile / onboarding flag is not a
    secret; the "never" is secrets in `storage.local`/`sync`);
  - contain gesture-timing logic or any gesture-timing constant — the single owner is
    `gesture-core` (CLAUDE.md §2); onboarding only *selects* a `Profile`, it owns no
    threshold/dwell value;
  - produce a `confirm()` (CLAUDE.md §2; boundary-lint rule 3);
  - import `zod` directly — validate through the schemas re-exported by
    `@gesture/protocol`.
- Every blob read from `chrome.storage` (`cameraGrantStatus` in `session`; `settings`
  in `sync`; `onboardingState` in `local`) is re-validated with its `protocol` Zod
  schema before use, and every value written (`Settings`, `OnboardingState`) is
  `Schema.parse`-d before the write (the page is hostile to its own stored blobs,
  arch §1).
- Page→SW messages are `OnboardingComplete` only (the SW owns the offscreen/pump
  lifecycle and runs its own grant gate); the camera grant crosses back as the reused
  `CameraGrantStatus` the SW/grant-page wrote to `storage.session`.
- Pure decision logic (`steps.ts`: presence → outcome, camera-status → next step,
  host-access → mode, step ordering, default profile) stays free of the DOM and
  `chrome.*` so it is unit-testable in node; `App.tsx` owns the I/O.
- Consumed via `package.json` `exports`; no deep imports.
