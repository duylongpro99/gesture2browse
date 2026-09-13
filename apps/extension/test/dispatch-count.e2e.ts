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
  test,
  type Worker,
} from '@playwright/test';

// Dispatch-count. Proves the click *dispatch* branch the plane takes: without
// the optional `debugger` permission the SW cannot attach CDP, so Click routes
// to the content-script synthetic fallback (`fallbackClick` → syntheticClick),
// whose events are `isTrusted === false` but still land (the counter increments).
//
// The trusted CDP branch (isTrusted === true) cannot be forced in-harness:
// granting an unpacked extension the `debugger` optional permission needs a user
// gesture + prompt that Playwright cannot satisfy headless, and there is no
// Chromium flag to pre-grant it. That branch is covered at the unit level
// (cdp.test.ts: trustedClick dispatches Input.dispatchMouseEvent press+release;
// dispatcher.test.ts: Click uses trusted CDP when granted+attached). This e2e
// therefore asserts the synthetic-fallback path and never fabricates isTrusted.

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

test('dispatch-count: no debugger → synthetic fallback lands with isTrusted false', async () => {
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

    const pt = await page.evaluate(() => {
      const el = document.getElementById('target') as HTMLElement;
      const r = el.getBoundingClientRect();
      return {
        x: (r.x + r.width / 2) / window.innerWidth,
        y: (r.y + r.height / 2) / window.innerHeight,
      };
    });

    let ts = 0;

    // Arm once past the clutch + stable-track gate.
    const armFrames: GestureFrame[] = [];
    const armEnd = PALM_CLUTCH_MS + STABLE_TRACK_MS + 300;
    for (; ts <= armEnd; ts += STEP_MS) armFrames.push(palmFrame(ts, pt));
    await inject(sw, armFrames);
    await new Promise((r) => setTimeout(r, 300));

    // Two pinch-taps over the target; each should land one synthetic click.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before = await page.evaluate(
        () => window.__clicks.synthetic + window.__clicks.trusted,
      );
      const park: GestureFrame[] = [];
      for (let k = 0; k < 3; k += 1) {
        ts += STEP_MS;
        park.push(pointFrame(ts, pt, 1));
      }
      await inject(sw, park);
      await new Promise((r) => setTimeout(r, HOVER_SETTLE_MS));

      ts += STEP_MS;
      const pinchIn = pointFrame(ts, pt, PINCH_IN - 0.05);
      ts += Math.round(TAP_MAX_MS / 2);
      const pinchOut = pointFrame(ts, pt, PINCH_OUT + 0.05);
      await inject(sw, [pinchIn, pinchOut]);

      await page.waitForFunction(
        (b) => window.__clicks.synthetic + window.__clicks.trusted > b,
        before,
        { timeout: 6_000 },
      );
    }

    const clicks = await page.evaluate(() => window.__clicks);
    // eslint-disable-next-line no-console
    console.log(
      `[dispatch-count] trusted=${clicks.trusted} synthetic=${clicks.synthetic} lastIsTrusted=${clicks.last?.isTrusted}`,
    );

    expect(clicks.trusted).toBe(0);
    expect(clicks.synthetic).toBe(2);
    expect(clicks.last?.isTrusted).toBe(false);
  } finally {
    await context.close();
    server.close();
  }
});
