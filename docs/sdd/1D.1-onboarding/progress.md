# 1D.1 onboarding — progress ledger

Plan: `docs/plans/1D.1-onboarding.md` (+ `.spec.md`, `.impl.md`). Seeded by the
plan session (session 0); execute sessions append their rows.

Task order (impl plan): 1 (protocol) → 2 (pure `steps.ts`) → 3 (page) and 4
(background) in parallel → 5 (e2e). Task 1 first (interfaces protocol-first, turns
I1/I2 green). Task 3 ships the new `.claude/rules/onboarding.md`.

| Task | Component | Commit | State | Notes |
|---|---|---|---|---|
| 1 | protocol | d62b1a1 | done | New `Profile` (default `accessibility`), `Settings`, `OnboardingState`, `OnboardingComplete` (additive, zod-only). Turns I1/I2 green. |
| 2 | onboarding (new) | 61516b1 | done | Pure DOM-free `steps.ts`: device-presence, camera-step, host-access mode, next-step, default profile. 15 unit tests. |
| 3 | onboarding (new) | — | todo | Full-tab React wizard (consent → camera handoff → site access → profile → ready) + `.claude/rules/onboarding.md`. Never `getUserMedia`; validates stored blobs. |
| 4 | background | — | todo | `onInstalled` first-run trigger; incomplete-onboarding pump gate; read `Settings.profile` → dispatcher; handle `OnboardingComplete`. Pure `onboarding-gate.ts`. |
| 5 | extension | — | todo | Playwright e2e (fake webcam): happy path + screenshot (E1); settings round-trip (E2); unhappy paths (no webcam, restricted `<all_urls>`, Allow-this-time); keyboard/aria path. |

## Exit checks (frozen at plan time, see plan `## Exit checks`)

E1 owner (screenshot review), E2 mechanical (`onboarding.e2e.ts`), I1/I2
consumer:1D.2,1D.3 contract tests — all fail today; execute Tasks 1/5 make them
pass.
