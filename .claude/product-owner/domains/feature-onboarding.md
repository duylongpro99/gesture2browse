---
id: feature-onboarding
title: First-run onboarding (1D.1)
relevance: ask about the install→first-use flow, activation, consent/privacy screen, camera/site-access setup, profile selection, "is onboarding ready", what first-run teaches (or doesn't)
status: current
related:
  - roadmap-phases: shipped in — 1D.1, first Phase-1 UI screen, merged 2026-09-15 (PR #13)
  - feature-direct-control: gets a user into — onboarding sets the Profile that governs dwell-click vs gesture set
  - constraint-privacy: leads with — consent screen's headline promise "video never leaves the device"
  - constraint-accessibility: defaults to — Accessibility profile at first run; ships full keyboard + screen-reader path
  - grant-camera (0C): delegates to — onboarding never calls getUserMedia; the persistent grant stays in the 0C page
sources:
  - docs/05-roadmap.md
  - docs/plans/1D.1-onboarding.md
---

The **first-run experience**: the flow that turns an install into a user who can point and click, with informed consent, in the fewest steps. A distinct product surface (its own success criterion — steps-to-first-use — separate from the gesture interaction itself). Merged 2026-09-15.

**Shipped flow (four steps):** consent/privacy (leads with "video never leaves the device", [[constraint-privacy]]) → camera-grant handoff into the existing 0C grant page (steers the user to "Allow on every visit" for a persistent grant) → site-access grant → **profile pick** → "you're ready" landing (links out to calibration and a cheat sheet; runs neither inline).

**Why this milestone matters beyond onboarding:** it makes **profile choice actually functional**. Before 1D.1 the product ran on a hardcoded Standard profile regardless of setting; now the user's pick (default **Accessibility**) genuinely drives behaviour — Accessibility → dwell-click on, error-prone gestures off ([[feature-direct-control]], [[constraint-accessibility]]). Only **Accessibility** and **Standard** are choosable; **Presenter** exists in the vocabulary but is hidden (consistent with presenter = Phase 3 non-goal, [[core-product]]).

**Unhappy paths covered (a real production-bar strength):** camera denied / "Allow this time" re-route, no-webcam dead-end, restricted `<all_urls>` degraded/retry, full keyboard + screen-reader path.

**What first-run does NOT do (scope cut — surface in any "onboarding ready?" answer):** it never shows or walks the user through a single gesture. "Ready to point and click" is *asserted, not demonstrated*. The guided tutorial (clutch/point/pinch/scroll) is deferred to the unbuilt 1D.6 cheat sheet; pinch calibration is only linked out to 1D.2, not run at first use.

## Open questions
- **Drift risk — PRD FR-30 not reconciled.** FR-30 still promises onboarding includes a 60-second guided tutorial (clutch/point/pinch/scroll) *and* inline pinch calibration. Shipped onboarding does neither; the roadmap §8 row records the supersession but the PRD text was not updated. A reader of the PRD alone would expect first-run to teach gestures and calibrate pinch — it does not. **Owner should reconcile FR-30** (docs are source of truth).
- **GPU warm-up and posture guidance vanished.** Both were named in the original 1D.1 first-run scope; neither shipped and neither was deferred to a named milestone — they simply left the plan. Posture guidance in particular bears on accuracy/fatigue (the ≥15-min-no-fatigue metric, [[core-product]]); owner should decide whether it's dropped or relocated.
- Activation risk: without a tutorial at first run, does a fresh user actually reach "I can point and click"? This is the retention metric's (50% still enabling tracking at day 7) leading indicator — worth watching in the developer-preview study.
