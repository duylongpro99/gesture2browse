# Dispatch survey fixtures (`fixtures/dispatch/`)

Local site clones for the 0D click-dispatch survey (gate G5, `docs/plans/0D-click-dispatch-survey.md`). Each file isolates **one** mechanism by which a page accepts or refuses a click, so the survey can record where a content-script **synthetic** (untrusted `dispatchEvent`) click fails and where a **CDP** (trusted `Input.dispatchMouseEvent`) click succeeds. They are the agent's deterministic eyes; the owner's live list (`LIVE_SITES`) is the real-world counterpart.

Static HTML/JS only — no build step, no network, no camera. The survey e2e (`apps/playground/test/click-dispatch-survey.e2e.ts`) serves this directory on **two** local origins so the cross-origin case is real.

## Success-sentinel convention

The clickable element is marked `data-dispatch-target` (the closed-shadow host uses `data-dispatch-host`). A click is judged to have **worked** by one of three signals, declared per fixture in `apps/playground/src/dispatch-sites.ts`:

| Probe | Signal | Used by |
|---|---|---|
| `flag` | the **top** window's `window.__dispatchOk` becomes `true` | most fixtures; iframe children `postMessage('dispatch-ok', '*')` and the parent sets the flag |
| `hash` | a same-page navigation lands on `#dispatched` | `anchor-href` |
| `popup` | a new page/popup opens | `window-open`, `target-blank` |

The survey reads the sentinel with `readSuccess(page, probe)` after each technique. A fresh page is used per (fixture × technique) so a passing synthetic run never leaks its flag into the CDP run.

## Origins

`cross-origin-iframe.html` reads `?child=<url>` and points its iframe at the child served from the **second** origin (`cross-origin-iframe-child.html`). Every other fixture is single-origin; `same-origin-iframe.html` loads its child by a relative path.

## Fixtures

| File | Mechanism | Expected finding |
|---|---|---|
| `button-onclick.html` | `addEventListener('click')` on the element | both pass (baseline) |
| `anchor-href.html` | `<a href="#…">` default-action navigation | discriminates whether the default action runs for untrusted clicks |
| `delegated-document.html` | listener on `document` (React/Vue-style delegation) | both pass — synthetic clicks bubble to `document` |
| `pointerdown-handler.html` | handler on `pointerdown`, not `click` | both pass — the synthetic sequence includes `pointerdown` |
| `capture-phase.html` | capture-phase listener | both pass — capture runs on dispatch |
| `istrusted-guard.html` | handler ignores `event.isTrusted === false` | synthetic fails, CDP passes |
| `native-select.html` | native `<select>` popup (OS-level, not DOM) | both fail — a click cannot pick an option |
| `window-open.html` | `window.open` gated on user activation | synthetic fails (no activation), CDP passes |
| `target-blank.html` | `<a target="_blank">` gated on user activation | discriminates activation-gated navigation |
| `same-origin-iframe.html` (+ `-child`) | target inside a same-origin iframe | both pass — top frame can reach a same-origin child |
| `cross-origin-iframe.html` (+ `-child`) | target inside a cross-origin iframe | synthetic cannot reach, CDP can |
| `canvas-hittest.html` | `<canvas>` hit-tested by pointer coordinates | both pass — both carry coordinates |
| `closed-shadow-dom.html` | target inside a closed shadow root | synthetic on the host misses, CDP hit-tests the inner element |
| `label-checkbox.html` | `<label>` → checkbox default-action toggle | discriminates label activation for untrusted clicks |
| `contenteditable.html` | focus/caret placement via click | discriminates default focus for untrusted clicks |

"Expected finding" is a hypothesis; the survey records the measured result. The e2e asserts only that every fixture × technique produced a well-formed outcome row — synthetic *failing* on the hard cases is the point, not a test failure.
