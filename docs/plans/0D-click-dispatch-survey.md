# 0D — Click-dispatch survey (gate G5) — Plan

**Milestone:** 0D (`docs/05-roadmap.md §3.2`) · **Branch:** `0D` · **Base:** `master` (0A scaffold present) · **Date:** 2026-09-05
**Spec / impl:** none yet — this spike is small enough that the five questions below plus the **Files:** block are the whole design. `obra-test-driven-development` drives the code; the roadmap row's agent verification ("Runs in Playwright") is the failing test.

Gate G5 (`docs/03-tech-stack.md §5.5`): survey ~20 representative sites (SPA frameworks, canvas UI, iframes, native `<select>`, `window.open`), recording **where a content-script synthetic click fails and where a CDP trusted click succeeds**, to decide the **dispatch default** entered in roadmap §8 and committed as a number in `03-tech-stack §4`. The survey is a diagnostic harness, not shipped extension code: it drives pages through Playwright and does not build or run the extension. Its result feeds 1A (dispatch default path) and 1C (dispatcher, CDP opt-in shape).

## 1. Placement

**One owner: the `apps/playground` harness** (`fixtures-and-tests.md`, whose `paths` cover `apps/playground/**`, `fixtures/**`, and `**/*.test.ts`). The survey is the exact sibling of the 0A bench harness: a camera-free Playwright experiment that runs a matrix and emits an outcome table. It owns the survey runner, the two dispatch-technique drivers, the pure outcome summariser, and the local site fixtures under `fixtures/dispatch/**`.

**No second component.** The survey does **not** touch `apps/extension` (no offscreen, no `background.ts`, no content script), `packages/protocol`, or `gesture-core`. It models the extension's two production input paths from outside:

- **synthetic** ← the content script's fallback `dispatchEvent` path (`content.md`: "`dispatchEvent` is the fallback input path"), reproduced as an injected, untrusted (`isTrusted === false`) pointer/mouse event sequence.
- **CDP** ← the service worker's primary `chrome.debugger` path (`background.md`: "CDP is the primary input path"), reproduced with a Playwright `CDPSession` calling the same DevTools `Input.dispatchMouseEvent` domain the extension's `chrome.debugger` uses. Same CDP domain ⇒ trusted-input fidelity transfers; the caveat is recorded in §5.

So placement is a single owner and needs no `packages/protocol` message (nothing crosses a component boundary at runtime — the only consumers of the survey output are the owner reading a table and the §8 decision).

## 2. Boundary check

| Component | Imports / runtime APIs | Allowed by rule? |
|---|---|---|
| `apps/playground` (survey runner) | `@playwright/test`, `CDPSession` (`Input.dispatchMouseEvent`), page-injected DOM event dispatch, `node:http` (serve fixtures on two local origins for the cross-origin case) | ✓ `fixtures-and-tests.md` governs `apps/playground/**`; Playwright + `node:*` are test infra already in `03-tech-stack §1–2`. No extension APIs, no `chrome.*`, no MediaPipe, no gesture timing. |
| `fixtures/dispatch/**` | static HTML/JS fixtures | ✓ `fixtures/**`; fixtures are the agent's deterministic eyes for a page-behaviour survey (the analogue of recorded landmarks). |

- **No new runtime dependency** — Playwright and its bundled CDP are already in `03-tech-stack`; the playground already depends on `@playwright/test` (0A bench e2e). No `pnpm-lock.yaml` change expected. If the execute session finds a helper genuinely needed, that is a `03-tech-stack §1–2` row and a §3 surface, not a quiet add.
- **Boundary-lint (0A Task 7):** no `VideoFrame`/`ImageBitmap` (none used), no `apiKey`, no `confirm()`, no gesture-timing constant (clutch/cooldown/hysteresis/dwell/debounce) — the survey introduces none. ✓
- **Fake-camera flags** — `apps/playground/playwright.config.ts` already launches with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture` and a y4m (`fixtures-and-tests.md`); the survey inherits them unchanged (harmless — it never opens a camera). ✓
- Consumed via `package.json` `exports`; no deep imports. The survey is a leaf (nothing imports it).

## 3. Interfaces touched

**None in `packages/protocol`.** The survey adds no `GestureFrame`, `Intent`, `PageCommand`, `PageEvent`, `Action`, or Companion shape. Its outcome record and CSV are **playground-internal**, not a cross-boundary message — nothing at runtime crosses two components, so there is no protocol schema (contrast 0B's `PumpStat`, which existed only because it crossed offscreen → SW).

0A's "bench CSV schema" is a plan input only as a **convention to copy**, not a shape to reuse: 0D emits its own `DISPATCH_COLUMNS` header via the same `rows → CSV` pattern (`BENCH_COLUMNS.join(',')` style), because a dispatch outcome is a different measurement than a bench timing row. The `FixtureRecord`/`GestureFrame` shapes are not consumed here. The 0D roadmap row lists no "Interfaces fixed here", so there are no `I` exit rows.

## 4. Principle check (`docs/02-architecture.md §1`)

- **Page is hostile** — the survey *measures* this principle directly: a hostile/uncooperative page may swallow untrusted synthetic events (event-delegation frameworks, `isTrusted` guards, user-activation gates on `window.open`/`target=_blank`, native `<select>` popups, cross-origin iframes, canvas hit-tests). CDP trusted input is the fallback for exactly the cases the page can refuse. The result decides how much the MVP must lean on the trusted path. ✓
- **Replaceable parts** — dispatch technique is a swappable strategy behind one interface (`syntheticClick` / `cdpClick` with identical signatures); the summariser is a pure function over outcome rows, independent of how they were produced. ✓
- **Two loops, two speeds** — N/A (no perception or agent loop; a one-shot survey).
- **Video stays in one process / Agent proposes, human disposes** — N/A (no camera, no agent, no page-side extension code).

## 5. Tests

- **`dispatch-survey.test.ts`** (Vitest, unit, pure): `summarizeOutcomes` (per-site synthetic/CDP verdict), `recommendDefault` (counts sites where synthetic fails but CDP passes → recommended default + rationale), and `outcomesToCsv` (header = `DISPATCH_COLUMNS`, one row per site × technique). Edge cases: all-pass, synthetic-only-fails, technique-unreachable (target not found / cross-origin).
- **`click-dispatch-survey.e2e.ts`** (Playwright — the roadmap row's agent verification, "Runs in Playwright"): serves `fixtures/dispatch/**` on two local origins, and for every local fixture runs **synthetic then CDP**, reading each fixture's success sentinel (`window.__dispatchOk`, a DOM sentinel, a navigation, or a new-page/popup event). Records one outcome row per (fixture × technique), writes the CSV, and asserts the run completed with a well-formed row for both techniques on every fixture (a coverage/soundness gate, not a "synthetic must pass" gate — synthetic *failing* on the hard cases is the finding). A `SURVEY_LIVE=1` env switch reruns the same two techniques over `LIVE_SITES` for the owner's spot-check run (network; not part of CI).
- **Fixture-first** — the local fixtures under `fixtures/dispatch/` are the agent's deterministic eyes; the live list is owner work (per `fixtures-and-tests.md`, real-site checks are owner work).
- Numbers (the per-site synthetic/CDP pass-fail table, the failure count, and the recommended default) recorded in `docs/spike-results.md` under **G5**.

**Local fixture set (~15, one discriminating mechanism each; the execute session may adjust the exact count toward the roadmap's "~20 sites" with the live list):**

| Fixture | Mechanism it discriminates |
|---|---|
| `button-onclick.html` | baseline `addEventListener('click')` on the element |
| `anchor-href.html` | `<a href>` navigation as a default action |
| `delegated-document.html` | listener on `document` (React/Vue-style event delegation) |
| `pointerdown-handler.html` | handler on `pointerdown`, not `click` (canvas/drag UIs) |
| `capture-phase.html` | capture-phase listener |
| `istrusted-guard.html` | handler that ignores `event.isTrusted === false` |
| `native-select.html` | native `<select>` popup (OS-level, not a DOM event) |
| `window-open.html` | `window.open` gated on user activation |
| `target-blank.html` | `<a target="_blank">` gated on user activation |
| `same-origin-iframe.html` | target inside a same-origin iframe |
| `cross-origin-iframe.html` | target inside a cross-origin iframe (synthetic cannot reach) |
| `canvas-hittest.html` | `<canvas>` UI hit-tested by trusted pointer coordinates |
| `closed-shadow-dom.html` | target inside a closed shadow root |
| `label-checkbox.html` | `<label>` → checkbox default-action toggle |
| `contenteditable.html` | focus/caret placement via click |

The **live list** (`LIVE_SITES`, owner-run) covers real framework/app instances the local fixtures only model in miniature (e.g. a React app, a canvas map, a site using native selects, a `window.open` flow). The owner spot-checks 5 of the sites the survey reports as failures (roadmap §3.3 G5).

## Files

**Files:**
- Create `fixtures/dispatch/README.md` — the fixture catalog and the success-sentinel convention (`data-dispatch-target` marks the element; `window.__dispatchOk` / DOM sentinel / navigation / popup signals success).
- Create `fixtures/dispatch/button-onclick.html`, `anchor-href.html`, `delegated-document.html`, `pointerdown-handler.html`, `capture-phase.html`, `istrusted-guard.html`, `native-select.html`, `window-open.html`, `target-blank.html`, `same-origin-iframe.html` (+ `same-origin-iframe-child.html`), `cross-origin-iframe.html` (+ `cross-origin-iframe-child.html`), `canvas-hittest.html`, `closed-shadow-dom.html`, `label-checkbox.html`, `contenteditable.html` — the local site fixtures.
- Create `apps/playground/src/dispatch-sites.ts` — pure catalog: each fixture's name, category, origin (same/cross), target selector, and success-probe descriptor; plus the `LIVE_SITES` list for the owner run.
- Create `apps/playground/src/dispatch-survey.ts` — pure: the outcome record type, `DISPATCH_COLUMNS`, `outcomesToCsv`, `summarizeOutcomes`, `recommendDefault`.
- Create `apps/playground/test/dispatch-techniques.ts` — Playwright helpers: `syntheticClick(page, target)` (inject an untrusted `pointerdown→mousedown→pointerup→mouseup→click` sequence, `bubbles`/`cancelable`), `cdpClick(page, target)` (a `CDPSession` `Input.dispatchMouseEvent` press/release at the target's bounding-box centre), and `readSuccess(page, probe)`.
- Create `apps/playground/test/click-dispatch-survey.e2e.ts` — the survey (agent verification): starts two local static origins, runs both techniques over every fixture, writes the CSV, asserts a well-formed row per fixture × technique; `SURVEY_LIVE=1` switches to `LIVE_SITES`.
- Create `apps/playground/test/dispatch-survey.test.ts` — Vitest unit for `summarizeOutcomes` / `recommendDefault` / `outcomesToCsv`.
- Modify `apps/playground/playwright.config.ts` — register the survey e2e (keep the existing fake-camera flags; add a project/testMatch if needed).
- Modify `docs/spike-results.md` — fill G5 Setup / Result (the per-site table + failure count) / Gate met / **Dispatch default chosen**.

No `packages/protocol` file, no `apps/extension` file, no new dependency, so no `pnpm-lock.yaml` change is expected.

## Exit checks

Not frozen by this docs-only planning session (the lock `docs/sdd/0D/exit-checks.lock` is out of scope; the execute/driver session freezes it once the commands run and `exit-check 0D --fast` is green). Criterion cells are verbatim: E1–E2 from the roadmap row's **Exit** cell (split at `;`), E3 from its **Agent verification** cell.

| # | Criterion (verbatim) | Kind | Check |
|---|---|---|---|
| E1 | Owner spot-check done | owner | - |
| E2 | dispatch default entered in §8 | owner | - |
| E3 | Runs in Playwright | mechanical | `pnpm exec playwright test -c apps/playground/playwright.config.ts click-dispatch-survey.e2e.ts` |

The roadmap 0D row lists no "Interfaces fixed here", so there are no `I` rows.

## Status

_Owned by the 0D session; rewritten, not appended._

**Done (session 0, plan):** wrote this plan — the five questions, the local fixture set, the **Files:** block, and the (unfrozen) Exit checks table. Placement is the `apps/playground` harness with fixtures under `fixtures/dispatch/**`; no extension, protocol, or gesture-core code; no new dependency. No owner question is open (all five questions answered from the roadmap row, the rule files, and the 0A/0B golden path), so no brainstorm and no NEEDS-OWNER.

**In progress:** none.

**Next:** the execute session (scope derived from the **Files:** block above) implements the survey with `obra-test-driven-development` — Vitest unit for the pure summariser first, then the Playwright survey over the local fixtures — records the per-site table and recommended default in `docs/spike-results.md §G5`, freezes the Exit-checks lock, and hands off. The owner then runs the live list (`SURVEY_LIVE=1`), spot-checks 5 reported-failure sites (E1), and logs the dispatch default in §8 (E2).

**Proposed decisions for roadmap §8 (owner logs; agent does not edit §8):** none yet — the dispatch default is proposed by the execute session from the measured table, then confirmed by the owner's spot-check. This planning session fixes no interface and proposes no decision.

**Blockers:** owner laptop/live-site access for the E1 spot-check (roadmap §3.3 G5); not a blocker for the agent's local-fixture survey.

**Superpowers conflicts noted (`CLAUDE.md §6`):** none.
