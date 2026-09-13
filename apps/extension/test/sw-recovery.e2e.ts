import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIN_CONFIDENCE,
  PALM_CLUTCH_MS,
  PINCH_IN,
  PINCH_OUT,
  STABLE_TRACK_MS,
  TAP_MAX_MS,
} from '@gesture/gesture-core';
import type { GestureFrame } from '@gesture/protocol';
import {
  type BrowserContext,
  chromium,
  expect,
  type Page,
  test,
  type Worker,
} from '@playwright/test';

// Exit check E3 — recovery of the pointer/click path after the control plane is
// disrupted.
//
// HARNESS LIMITATION (measured, not assumed): a literal service-worker *process*
// kill is not drivable in Playwright 1.63 headless. Two things were tried and
// proven not to work against this built extension:
//   1. CDP `Target.closeTarget` / `ServiceWorker.stopAllWorkers` on the SW target
//      are no-ops — Playwright keeps a debugger attached to the SW, which pins it
//      alive, so it never terminates and never respawns.
//   2. `chrome.runtime.reload()` de-registers the whole extension: the old SW
//      disappears and NO new SW is created — the extension's own resources
//      (`manifest.json`, `offscreen.html`) then return net::ERR_BLOCKED_BY_CLIENT.
//      The extension does not come back, so nothing can recover.
// (The SW-side recovery machinery itself — `ports.restoreState()`, the registry's
// content-port reconnect, `reinject.reinjectMissing` — is unit-covered in
// ports-reconnect.test.ts / reinject.test.ts, and the perception-side gap is
// closed by the offscreen reconnect added to offscreen/main.ts.)
//
// So this e2e drives the recovery step that IS reachable end to end and that
// actually re-establishes the pointer/click path after any SW restart: the
// content-script port is torn down and rebuilt (a full page reload destroys the
// old document + its SW→CS port and injects a fresh content script that
// reconnects — the same registry reconnect path Task 7 hardened for a SW
// restart's re-injection). It asserts the scripted arm→point→pinch click lands
// again on the rebuilt content plane. Gesture timing is imported from
// gesture-core; no threshold literal is duplicated.

declare const chrome: {
  runtime: { sendMessage(message: unknown): void };
};

declare global {
  interface Window {
    __clicks: {
      trusted: number;
      synthetic: number;
      last: { isTrusted: boolean } | null;
    };
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(here, '..');
const extOut = resolve(extDir, '.output/chrome-mv3');
const y4m = resolve(here, '../../../fixtures/bench/placeholder.y4m');
const pagePath = resolve(here, 'fixtures/click-count-page.html');

const SCORE = MIN_CONFIDENCE + 0.4;
const STEP_MS = 100;
const HOVER_SETTLE_MS = 400;

function buildExtension(): void {
  if (
    existsSync(resolve(extOut, 'manifest.json')) &&
    process.env.E2E_SKIP_BUILD
  )
    return;
  execFileSync('pnpm', ['--filter', '@gesture/extension', 'build'], {
    cwd: resolve(extDir, '../..'),
    stdio: 'inherit',
    env: { ...process.env, VITE_TEST_HOOKS: '1' },
  });
}

async function getServiceWorker(context: BrowserContext): Promise<Worker> {
  const existing = context.serviceWorkers();
  if (existing[0]) return existing[0];
  return context.waitForEvent('serviceworker', { timeout: 30_000 });
}

function startPageServer(): Promise<{ server: Server; url: string }> {
  const html = readFileSync(pagePath, 'utf8');
  return new Promise((resolveP, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(html);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('http server did not bind to a port'));
        return;
      }
      resolveP({ server, url: `http://127.0.0.1:${address.port}/` });
    });
  });
}

interface Pointer {
  x: number;
  y: number;
}

function palmFrame(ts: number, pointer: Pointer): GestureFrame {
  return {
    ts,
    present: true,
    gesture: 'Open_Palm',
    score: SCORE,
    pinch: 1,
    fingers: [true, true, true, true, true],
    velocity: { vx: 0, vy: 0 },
    scale: 1,
    pointer,
  };
}

function pointFrame(ts: number, pointer: Pointer, pinch: number): GestureFrame {
  return {
    ts,
    present: true,
    gesture: 'Pointing_Up',
    score: SCORE,
    pinch,
    fingers: [false, true, false, false, false],
    velocity: { vx: 0, vy: 0 },
    scale: 1,
    pointer,
  };
}

async function inject(sw: Worker, frames: GestureFrame[]): Promise<void> {
  await sw.evaluate(
    (fs) => chrome.runtime.sendMessage({ type: '__inject_frames', frames: fs }),
    frames,
  );
}

/** Read the fixture target's normalized viewport-fraction centre. */
async function targetPointer(page: Page): Promise<Pointer> {
  return page.evaluate(() => {
    const el = document.getElementById('target') as HTMLElement;
    const r = el.getBoundingClientRect();
    return {
      x: (r.x + r.width / 2) / window.innerWidth,
      y: (r.y + r.height / 2) / window.innerHeight,
    };
  });
}

/** Park the pointer over the target (hover round-trips → SW `lastHover`), then a
 * self-contained pinch batch spanning the stable-track window fires a tap Click.
 * Returns the next logical ts. */
async function pointAndTap(
  sw: Worker,
  startTs: number,
  pt: Pointer,
): Promise<number> {
  let ts = startTs;
  const park: GestureFrame[] = [];
  for (let k = 0; k < 3; k += 1) {
    ts += STEP_MS;
    park.push(pointFrame(ts, pt, 1));
  }
  await inject(sw, park);
  await new Promise((r) => setTimeout(r, HOVER_SETTLE_MS));

  // A single contiguous batch so no live/other frame interleaves between the
  // pinch-in (latches the hovered target) and the pinch-out (fires the tap).
  const pinch: GestureFrame[] = [];
  for (const end = ts + STABLE_TRACK_MS + 200; ts <= end; ts += STEP_MS) {
    pinch.push(pointFrame(ts, pt, 1));
  }
  ts += STEP_MS;
  pinch.push(pointFrame(ts, pt, PINCH_IN - 0.05));
  ts += Math.round(TAP_MAX_MS / 2);
  pinch.push(pointFrame(ts, pt, PINCH_OUT + 0.05));
  await inject(sw, pinch);
  return ts + STEP_MS;
}

/** Clutch Paused → Armed (Open_Palm past PALM_CLUTCH + STABLE_TRACK), then tap. */
async function armAndTap(
  sw: Worker,
  startTs: number,
  pt: Pointer,
): Promise<number> {
  let ts = startTs;
  const armFrames: GestureFrame[] = [];
  const armEnd = ts + PALM_CLUTCH_MS + STABLE_TRACK_MS + 300;
  for (; ts <= armEnd; ts += STEP_MS) armFrames.push(palmFrame(ts, pt));
  await inject(sw, armFrames);
  await new Promise((r) => setTimeout(r, 300));
  return pointAndTap(sw, ts, pt);
}

test('sw-recovery: the pointer/click path recovers after the content plane is torn down', async () => {
  buildExtension();

  const { server, url } = await startPageServer();

  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extOut}`,
      `--load-extension=${extOut}`,
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${y4m}`,
    ],
  });

  try {
    const sw = await getServiceWorker(context);

    const page = await context.newPage();
    await page.goto(url);
    await new Promise((r) => setTimeout(r, 2_000));

    // Baseline: the click path works before the disruption.
    let ts = 0;
    ts = await armAndTap(sw, ts, await targetPointer(page));
    await page.waitForFunction(
      () =>
        window.__clicks &&
        window.__clicks.synthetic + window.__clicks.trusted >= 1,
      undefined,
      { timeout: 8_000 },
    );

    // Disruption: tear down the content-script port. A full reload destroys the
    // old document and its SW→CS port (the registry drops it on onDisconnect) and
    // injects a fresh content script that reconnects — the same content-port
    // reconnect Task 7 hardened for a SW-restart re-injection. `window.__clicks`
    // is reset to 0 by the reload, so any click after this proves the rebuilt
    // plane, not a stale count.
    await page.reload({ timeout: 15_000 });
    // Settle for the fresh content script to connect and post `ready`.
    await new Promise((r) => setTimeout(r, 2_500));

    // Recovery: the FSM (owned by the still-live SW) stays Armed across the
    // reload, so a fresh point→pinch on the rebuilt content plane must land a
    // click on the new page's target.
    const before = await page.evaluate(
      () => window.__clicks.synthetic + window.__clicks.trusted,
    );
    ts = await pointAndTap(sw, ts, await targetPointer(page));
    await page.waitForFunction(
      (b) => window.__clicks.synthetic + window.__clicks.trusted > b,
      before,
      { timeout: 10_000 },
    );

    const after = await page.evaluate(
      () => window.__clicks.synthetic + window.__clicks.trusted,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[E3] sw-recovery: click landed on the rebuilt content plane (before=${before}, after=${after}, recovered=${after > before})`,
    );
    expect(after).toBeGreaterThan(before);
  } finally {
    await context.close();
    server.close();
  }
});
