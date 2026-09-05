/**
 * Catalog of the click-dispatch survey sites (plan §5). Pure data: no browser
 * globals, no Playwright. Each entry names the discriminating mechanism, where
 * its target lives (`origin`, optional `frame`), the target selector, and how a
 * successful click is observed (`probe`). The e2e drives both techniques over
 * this list; the unit tests never need it.
 *
 * Success-probe kinds (the fixture HTML documents its own signal, see
 * `fixtures/dispatch/README.md`):
 *  - `flag`  — the top window's `window.__dispatchOk` becomes `true` (handlers
 *              in a child frame `postMessage` the top window, which sets it).
 *  - `hash`  — a same-page navigation lands on `#dispatched`.
 *  - `popup` — a new page/popup opens (user-activation-gated `window.open` /
 *              `target=_blank`).
 */

export type SuccessProbe =
  | { kind: 'flag' }
  | { kind: 'hash'; value: string }
  | { kind: 'popup' };

export interface DispatchSite {
  /** Fixture basename without extension; also the CSV `site` value. */
  name: string;
  /** The discriminating mechanism. */
  category: string;
  /** Fixture file under `fixtures/dispatch/`. */
  file: string;
  /** `cross` fixtures embed a child served from the second local origin. */
  origin: 'same' | 'cross';
  /** CSS selector of the clickable target (inside `frame` when set). */
  target: string;
  /** When the target lives in an iframe, the iframe's selector in the top doc. */
  frame?: string;
  probe: SuccessProbe;
}

const flag: SuccessProbe = { kind: 'flag' };

/**
 * The local fixture set — one discriminating mechanism each. `cross-origin-iframe`
 * is the only entry whose child is served from the second origin; every other
 * fixture is single-file on the primary origin.
 */
export const DISPATCH_SITES: DispatchSite[] = [
  { name: 'button-onclick', category: 'addEventListener(click)', file: 'button-onclick.html', origin: 'same', target: '[data-dispatch-target]', probe: flag },
  { name: 'anchor-href', category: 'anchor default-action nav', file: 'anchor-href.html', origin: 'same', target: '[data-dispatch-target]', probe: { kind: 'hash', value: '#dispatched' } },
  { name: 'delegated-document', category: 'document-level delegation', file: 'delegated-document.html', origin: 'same', target: '[data-dispatch-target]', probe: flag },
  { name: 'pointerdown-handler', category: 'pointerdown, not click', file: 'pointerdown-handler.html', origin: 'same', target: '[data-dispatch-target]', probe: flag },
  { name: 'capture-phase', category: 'capture-phase listener', file: 'capture-phase.html', origin: 'same', target: '[data-dispatch-target]', probe: flag },
  { name: 'istrusted-guard', category: 'isTrusted guard', file: 'istrusted-guard.html', origin: 'same', target: '[data-dispatch-target]', probe: flag },
  { name: 'native-select', category: 'native <select> popup', file: 'native-select.html', origin: 'same', target: '[data-dispatch-target]', probe: flag },
  { name: 'window-open', category: 'window.open user-activation', file: 'window-open.html', origin: 'same', target: '[data-dispatch-target]', probe: { kind: 'popup' } },
  { name: 'target-blank', category: 'target=_blank user-activation', file: 'target-blank.html', origin: 'same', target: '[data-dispatch-target]', probe: { kind: 'popup' } },
  { name: 'same-origin-iframe', category: 'same-origin iframe target', file: 'same-origin-iframe.html', origin: 'same', target: '[data-dispatch-target]', frame: 'iframe', probe: flag },
  { name: 'cross-origin-iframe', category: 'cross-origin iframe target', file: 'cross-origin-iframe.html', origin: 'cross', target: '[data-dispatch-target]', frame: 'iframe', probe: flag },
  { name: 'canvas-hittest', category: 'canvas coordinate hit-test', file: 'canvas-hittest.html', origin: 'same', target: 'canvas[data-dispatch-target]', probe: flag },
  { name: 'closed-shadow-dom', category: 'closed shadow root target', file: 'closed-shadow-dom.html', origin: 'same', target: '[data-dispatch-host]', probe: flag },
  { name: 'label-checkbox', category: 'label default-action toggle', file: 'label-checkbox.html', origin: 'same', target: '[data-dispatch-target]', probe: flag },
  { name: 'contenteditable', category: 'contenteditable focus/caret', file: 'contenteditable.html', origin: 'same', target: '[data-dispatch-target]', probe: flag },
];

/**
 * Live sites for the owner's `SURVEY_LIVE=1` run (plan §5). These real
 * framework/app instances are what the local fixtures model in miniature; the
 * owner spot-checks 5 reported failures (roadmap §3.3 G5). Network — not CI.
 * `target` is filled in by the owner per site at run time when it is empty.
 */
export interface LiveSite {
  name: string;
  category: string;
  url: string;
  target: string;
  probe: SuccessProbe;
}

export const LIVE_SITES: LiveSite[] = [
  { name: 'react-todomvc', category: 'React SPA delegation', url: 'https://todomvc.com/examples/react/dist/', target: '.new-todo', probe: flag },
  { name: 'vue-todomvc', category: 'Vue SPA delegation', url: 'https://todomvc.com/examples/vue/dist/', target: '.new-todo', probe: flag },
  { name: 'openstreetmap', category: 'canvas/SVG map hit-test', url: 'https://www.openstreetmap.org/', target: '.control-zoom-in', probe: flag },
  { name: 'mdn-select', category: 'native <select>', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/select', target: 'select', probe: flag },
  { name: 'wikipedia-anchor', category: 'anchor navigation', url: 'https://en.wikipedia.org/wiki/Main_Page', target: '#n-contents a', probe: flag },
];
