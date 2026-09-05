import type { CDPSession, Page } from '@playwright/test';
import type { SuccessProbe } from '../src/dispatch-sites.js';

/**
 * The two dispatch techniques the survey compares, plus the success reader.
 * Each models one production input path from outside the extension (plan §1):
 *
 *  - {@link syntheticClick}: the content script's untrusted `dispatchEvent`
 *    fallback. Runs entirely in the page's top frame via `page.evaluate`, so it
 *    can reach a same-origin child document but — like a real content script —
 *    cannot touch a cross-origin child.
 *  - {@link cdpClick}: the service worker's trusted `chrome.debugger` path,
 *    reproduced with a Playwright `CDPSession` calling the same DevTools
 *    `Input.dispatchMouseEvent` domain, at the target's viewport coordinates.
 *
 * Same CDP domain ⇒ trusted-input fidelity transfers (plan §5): the caveat is
 * that this is Playwright's CDP, not `chrome.debugger`, but both drive the
 * identical DevTools input command, so a trusted click here means a trusted
 * click there.
 */

export interface ClickTarget {
  /** CSS selector of the clickable element (inside `frame` when set). */
  selector: string;
  /** When the target is in an iframe, the iframe's selector in the top document. */
  frame?: string;
}

export interface TechniqueResult {
  /** The technique located the target and dispatched an event at it. */
  reached: boolean;
  detail: string;
}

/**
 * Inject an untrusted `pointerdown → mousedown → pointerup → mouseup → click`
 * sequence (bubbling, cancelable, `isTrusted === false`) at the target's centre.
 * Reaching into a cross-origin `frame` throws and is reported as unreachable —
 * exactly a content script's limit.
 */
export async function syntheticClick(page: Page, target: ClickTarget): Promise<TechniqueResult> {
  return page.evaluate(({ selector, frame }) => {
    let doc: Document = document;
    if (frame) {
      const f = document.querySelector(frame) as HTMLIFrameElement | null;
      let cdoc: Document | null = null;
      try {
        cdoc = f ? f.contentDocument : null;
      } catch {
        cdoc = null;
      }
      if (!cdoc) return { reached: false, detail: 'cross-origin-unreachable' };
      doc = cdoc;
    }
    const el = doc.querySelector(selector) as HTMLElement | null;
    if (!el) return { reached: false, detail: 'target-not-found' };
    const r = el.getBoundingClientRect();
    const init: PointerEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      view: doc.defaultView ?? window,
    };
    el.dispatchEvent(new PointerEvent('pointerdown', init));
    el.dispatchEvent(new MouseEvent('mousedown', init));
    el.dispatchEvent(new PointerEvent('pointerup', init));
    el.dispatchEvent(new MouseEvent('mouseup', init));
    el.dispatchEvent(new MouseEvent('click', init));
    return { reached: true, detail: 'synthetic-dispatched' };
  }, target);
}

/**
 * Press and release a trusted left mouse button at the target's viewport centre
 * via `Input.dispatchMouseEvent`. Playwright's frame locator yields page-relative
 * coordinates for a target in any iframe (same- or cross-origin), so the trusted
 * click lands where a content script's synthetic event cannot reach.
 */
export async function cdpClick(page: Page, target: ClickTarget): Promise<TechniqueResult> {
  const locator = target.frame
    ? page.frameLocator(target.frame).locator(target.selector)
    : page.locator(target.selector);
  let box: { x: number; y: number; width: number; height: number } | null = null;
  try {
    box = await locator.first().boundingBox({ timeout: 4000 });
  } catch {
    box = null;
  }
  if (!box) return { reached: false, detail: 'no-bounding-box' };
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const client: CDPSession = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
  } finally {
    await client.detach();
  }
  return { reached: true, detail: 'cdp-trusted-click' };
}

/**
 * Read a non-popup success sentinel. Popups are observed by the survey runner
 * (`page.on('popup')`), not here, because they surface as a browser event rather
 * than page state.
 */
export async function readSuccess(page: Page, probe: SuccessProbe): Promise<boolean> {
  if (probe.kind === 'flag') {
    return page.evaluate(() => (window as { __dispatchOk?: boolean }).__dispatchOk === true);
  }
  if (probe.kind === 'hash') {
    return page.evaluate((v) => location.hash === v, probe.value);
  }
  return false;
}
