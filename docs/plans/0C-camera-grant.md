# 0C — Camera grant (gate G2) — Plan

**Milestone:** 0C (`docs/05-roadmap.md §3.2`) · **Branch:** `0C` · **Base:** `master` (0A scaffold + 0B frame pump present) · **Date:** 2026-09-05
**Spec / impl:** none yet — like 0B, this spike is small enough that the five questions below plus the **Files:** block are the whole design. `obra-test-driven-development` drives the code; the roadmap row's agent verification is the failing test.

Gate G2 (`docs/03-tech-stack.md §5.2`, arch §3.4): `getUserMedia` fails with `NotAllowedError` in the offscreen, popup, and side-panel pages unless the `chrome-extension://<id>` origin already holds a **persistent** grant, and Chrome's **"Allow this time"** grant is revoked on tab close (04-feasibility A2). So onboarding opens a **full-tab** extension page that requests the camera and tells the user to pick "Allow on every visit"; and **before every offscreen start** the extension checks `navigator.permissions.query({name:'camera'})` and routes back to that page when the state is not `granted`. The gate is met when a full-tab grant survives a Chrome restart so the offscreen `getUserMedia` succeeds **without a prompt**, and the "Allow this time" failure mode is **detected** (not silently mistaken for a persistent grant). This flow is durable: 1D.1 (plan input "0C grant page") builds first-run onboarding on top of it.

## 1. Placement

**Two owners, joined by one `protocol` message.**

- **The grant page** (`apps/extension/entrypoints/grant-camera/**`, new rule `.claude/rules/grant-camera.md`) owns the full-tab UI: the `navigator.permissions.query` pre-check readout, `getUserMedia` to trigger the grant, the "Allow on every visit" guidance, and the "Allow this time" detection. It **acquires the stream only to trigger the permission and immediately stops every track** — it renders status text, never video (raw video stays in the offscreen document, arch §6).
- **The service worker** (`background.ts`) owns the **pre-check gate**: before `ensureOffscreen()` it checks the camera permission state and, when not `granted`, opens the grant page via `chrome.tabs.create`; on startup it runs the cross-session "Allow this time" detection. `background.ts` already creates the offscreen document (0B), so the gate sits in front of that existing call.

The message that joins them is a new `protocol` schema **`CameraGrantStatus`** (§3), written to `chrome.storage.session` by whichever side last observed the permission and read by the background gate (and by 1D.1 onboarding later). No content script, no side panel, no gesture-core, no FSM (0C introduces no gesture timing).

The 0A stub (`grant-camera/main.ts`, `index.html`) names 0C/G2 as its filler.

## 2. Boundary check

| Component | Imports / runtime APIs | Allowed by rule? |
|---|---|---|
| grant page | `navigator.mediaDevices.getUserMedia`, `navigator.permissions.query`, `chrome.storage.session`/`local`, `chrome.runtime`, `@gesture/protocol` | **new** `.claude/rules/grant-camera.md` (this PR, CLAUDE.md §5): may depend on `chrome.storage`/`chrome.runtime`/`chrome.tabs`, `navigator.mediaDevices`/`navigator.permissions`, `protocol`. **Must never:** retain or export video/`VideoFrame`/`ImageBitmap` (stream tracks stopped immediately after grant), render raw video, network calls, secrets in storage, gesture logic, produce a `confirm`. |
| background | `navigator.permissions.query`, `chrome.tabs.create`, `chrome.storage.session`/`local`, `chrome.offscreen.*` (existing), `@gesture/protocol` | ✓ `.claude/rules/background.md` allows `chrome.*` + `protocol`; validates the `CameraGrantStatus` read from storage with the Zod schema before acting; grant state is not a secret (the "never" is secrets in `storage.local/sync`). |
| protocol | `zod` only | ✓ |

Boundary-lint (0A Task 7): the grant page never names `VideoFrame`/`ImageBitmap` (only offscreen may), holds no `apiKey`, and produces no `confirm()`; it introduces no gesture-timing constant. ✓ All packages consumed via `package.json` `exports`; no deep imports.

**Open technical question the spike resolves (not an owner decision):** whether `navigator.permissions.query({name:'camera'})` is answerable inside an MV3 service worker. If it is not, the background gate falls back to reading the last `CameraGrantStatus` from `chrome.storage.session` (written by the grant page / a documentless probe) and the grant page remains the authoritative query site. The e2e records which path Chrome actually supports; this is a finding for `spike-results.md`, resolved in code, not a NEEDS-OWNER.

## 3. Interfaces touched

Adds **one** Zod schema to `packages/protocol`, defined there first, then read by background (and 1D.1 later):

```
CameraGrantStatus = {
  ts: number;                                   // performance.now()/Date.now() at observation
  state: 'granted' | 'denied' | 'prompt';       // navigator.permissions PermissionState
  persistent: boolean;                          // true = survives (Allow on every visit);
                                                //   false = "Allow this time" suspected / not persistent
  source: 'grant-page' | 'background-precheck'; // who observed it
}
```

"Allow this time" detection is a **cross-session inference**, factored into a pure helper: when a grant is first obtained the extension records `cameraGrantSeen = true` in `chrome.storage.local`; on a later fresh startup, if `permissions.query` reports `prompt`/`denied` while `cameraGrantSeen` is true, the earlier grant was temporary → `persistent: false`. At grant time both grant kinds return `granted` with a working stream, so persistence is only observable across a tab-close / restart — which is exactly the owner's exit check.

Does **not** touch `GestureFrame` v0, `FixtureRecord`, `Intent`, `BENCH_COLUMNS`, or `PumpStat` (all fixed by 0A/0B). `CameraGrantStatus` is grant-scoped; the roadmap 0C row has no "Interfaces fixed here", so 0C fixes no shared shape with a *downstream sibling probe* — 1D.1 consumes it as onboarding state.

## 4. Principle check (`docs/02-architecture.md §1`)

- **Video stays in one process** — the grant page requests the camera *only* to move the origin's permission to `granted`, then stops every track; no `VideoFrame`/`OffscreenCanvas`/preview, nothing exported. Only the numeric/enum `CameraGrantStatus` crosses to the SW, enforced by boundary-lint. ✓
- **Page is hostile** — the grant page is our own extension page, but the background gate still validates the `CameraGrantStatus` it reads from storage against the Zod schema before acting (never trusts a raw stored blob). ✓
- **Replaceable parts** — the persistence-detection logic is a pure function (unit-testable without a browser); the permission-query site (page vs SW) is decided by feature detection, not hard-wired. ✓
- **Two loops, two speeds / Agent proposes, human disposes** — N/A (0C introduces no perception loop and no agent code).

## 5. Tests

- **`permission.test.ts`** (Vitest, unit): the pure persistence/derivation helper — `granted` + seen → `persistent: true`; `prompt`/`denied` + seen → "Allow this time" suspected (`persistent: false`); `granted` + unseen → first grant; maps a `PermissionState` to a `CameraGrantStatus`.
- **`CameraGrantStatus` schema test** (Vitest, in protocol): accepts a valid record, rejects a bad `state`/`source`, rejects a missing field.
- **`camera-grant.e2e.ts`** (Playwright, the roadmap row's agent verification "Playwright with pre-granted permissions"): loads the built unpacked extension in a context where the camera is **pre-granted to the extension origin** (`context.grantPermissions(['camera'])`) and **without** the `--use-fake-ui-for-media-stream` auto-accept flag, so the test proves the offscreen/grant path works from a real origin grant rather than an auto-accepted prompt. Asserts: (a) the grant page's `permissions.query` pre-check reads `granted` and `getUserMedia` resolves with no prompt; (b) `CameraGrantStatus { state: 'granted', persistent: true }` lands in `chrome.storage.session`; (c) the background pre-check gate does **not** open a grant tab when the origin is already `granted`, and the offscreen `getUserMedia` succeeds. Fixture-first: the y4m fake camera under `fixtures/bench/` is the eyes; no real camera.
- The Chrome-restart survival and the live "Allow this time" revert are **owner** checks (a browser restart is outside Playwright); recorded in `docs/spike-results.md §G2`.

## Files

**Files:**
- Create `.claude/rules/grant-camera.md` — rule for `apps/extension/entrypoints/grant-camera/**`: allowed deps (`chrome.storage`/`runtime`/`tabs`, `navigator.mediaDevices`/`permissions`, `protocol`) and the "never retain/export/render video, no secrets, no gesture logic, no `confirm`" boundary (CLAUDE.md §5: new component ⇒ new rule in the same PR).
- Create `apps/extension/entrypoints/grant-camera/permission.ts` — pure persistence/derivation helper (`PermissionState` + `seen` → `CameraGrantStatus`), no browser globals, unit-testable.
- Create `packages/protocol/src/camera-grant.ts` — `CameraGrantStatus` Zod schema + type.
- Modify `apps/extension/entrypoints/grant-camera/main.ts` — `permissions.query` pre-check readout → `getUserMedia({video:true})` → stop all tracks immediately → re-query → derive + write `CameraGrantStatus` to `storage.session`, set `cameraGrantSeen` in `storage.local`; render `granted`/`prompt`/`denied` state and "Allow on every visit" guidance; surface the "Allow this time" warning when `persistent` is false.
- Modify `apps/extension/entrypoints/grant-camera/index.html` — replace the 0A skeleton copy with the real status region + guidance markup.
- Modify `apps/extension/entrypoints/background.ts` — add `ensureCameraPermission()` before `ensureOffscreen()`: query camera state (or fall back to the last `CameraGrantStatus`), open the grant page via `chrome.tabs.create` when not `granted`; on startup run the cross-session "Allow this time" detection and write `CameraGrantStatus { source: 'background-precheck' }`.
- Modify `packages/protocol/src/index.ts` — export `CameraGrantStatus`.
- Modify `apps/extension/playwright.config.ts` — a grant e2e context/project with the camera pre-granted and no `--use-fake-ui-for-media-stream` (0B's pump project keeps its flags).
- Modify `docs/spike-results.md` — fill G2 Setup / Result (numbers) / Gate met (and clear the stray `30.5` left in the G2 Result cell by an earlier owner edit, noted in the 0B plan).
- Modify `pnpm-lock.yaml` — only if a dep changes (none expected; `@playwright/test` already present from 0B).
- Test `apps/extension/test/camera-grant.e2e.ts` — the pre-granted-permission gate (agent verification).
- Test `apps/extension/test/permission.test.ts` — the persistence/derivation helper unit test.
- Test `packages/protocol/test/schemas.test.ts` — add the `CameraGrantStatus` schema cases (or a sibling `camera-grant.test.ts`).

## Exit checks

Not frozen by this docs-only session (the lock `docs/sdd/0C/exit-checks.lock` is out of scope; the implementing/driver session freezes once the commands run). Criterion cells are verbatim: E1 from the roadmap row's **Exit** cell, E2 from its **Agent verification** cell.

| # | Criterion (verbatim) | Kind | Check |
|---|---|---|---|
| E1 | Owner's Chrome-restart check logged | owner | - |
| E2 | Playwright with pre-granted permissions | mechanical | `pnpm exec playwright test -c apps/extension/playwright.config.ts camera-grant.e2e.ts` |

## Status

_Owned by the 0C session; rewritten, not appended._

**Done (session 1, implement, TDD):** the whole **Files:** block, all green.
- `packages/protocol/src/camera-grant.ts` — `CameraGrantStatus` + `CameraPermissionState` Zod schemas, exported from `index.ts`; schema cases in `test/schemas.test.ts` (28 protocol tests pass).
- `apps/extension/entrypoints/grant-camera/permission.ts` — pure `deriveGrant(state, seen, source, ts)` helper (persistence + "Allow this time" + first-grant), no browser globals; `test/permission.test.ts` (6 cases) green.
- `apps/extension/entrypoints/grant-camera/{main.ts,index.html}` — full-tab page: `permissions.query` pre-check → `getUserMedia` → stop all tracks → re-query → derive + write `CameraGrantStatus` to `storage.session` + `cameraGrantSeen` to `storage.local`; renders state + "Allow on every visit" guidance + "Allow this time" warning. No video rendered/retained.
- `apps/extension/entrypoints/background.ts` — `ensureCameraPermission()` gate before `ensureOffscreen()`: queries the camera state, opens the grant page via `chrome.tabs.create` only on a *definitive* not-granted signal (proceeds on `unknown` so an indeterminate SW never strands a working pump), writes `CameraGrantStatus { source: 'background-precheck' }` + a `cameraPrecheck` diagnostic; `RunCameraPrecheck` re-runs the gate on demand.
- `.claude/rules/grant-camera.md` — new component boundary rule (CLAUDE.md §5).
- `apps/extension/playwright.config.ts` — two named projects (`frame-pump`, `camera-grant`).
- `apps/extension/test/camera-grant.e2e.ts` — E2 (pre-granted permission): grant page reads `granted`, `getUserMedia` no prompt, `CameraGrantStatus{granted,persistent:true,source:'grant-page'}` in `storage.session`, gate opens no tab, offscreen `getUserMedia` succeeds.

**Verification:** `tsc` (protocol + extension) clean; `boundary-lint` OK; eslint clean; protocol 28 + extension 12 unit tests pass; `pnpm exec playwright test -c apps/extension/playwright.config.ts` — **2 passed** (G2 camera-grant; G1 frame-pump unregressed, full 60 s window p05 30.0 fps).

**Spike finding (resolves plan §2 open question):** the MV3 **service worker _can_ answer `navigator.permissions.query({name:'camera'})`** in this Chromium build (E2 `queryAnswered: true`, `source: 'sw-query'`). The background gate queries directly; the last-`CameraGrantStatus` `storage.session` fallback is retained for any build/context where the SW query throws.

**Owner E1 (2026-09-05) — DONE, PASS.** Recorded in `spike-results.md §G2`: E1a restart survival PASS (persistent grant survived a full Chrome quit/reopen; offscreen `getUserMedia` ran with no prompt, `cameraPrecheck.state === 'granted'`), E1b "Allow this time" detection PASS (temporary grant not mistaken for persistent; warning shown, `persistent === false`). **Owner approved G2 = GO.** Gate met = Y (E2 agent + E1 owner). Milestone complete.

**Proposed decision for roadmap §8 (owner logs; agent does not edit §8):**
> | 2026-09-05 | **G2 (0C) camera grant = GO.** Full-tab grant page moves the extension origin to a persistent camera grant that the offscreen document inherits across a Chrome restart with no prompt; a `background.ts` `navigator.permissions.query` pre-check gates every offscreen start and routes to the grant page when not granted; Chrome's "Allow this time" is detected (cross-session, `persistent:false`), not mistaken for a persistent grant. Finding: the MV3 service worker **can** answer `permissions.query({name:'camera'})` (direct SW query; stored-`CameraGrantStatus` fallback retained). Consumed by 1D.1 onboarding. | G2 (0C): E2 Playwright (pre-granted) + E1 owner restart/"Allow this time" | Recorded in `spike-results.md §G2` |

**Blockers:** none — E1/E1b PASS, owner GO. Handoff `DONE`.

**Superpowers conflicts noted (`CLAUDE.md §6`):** none.
