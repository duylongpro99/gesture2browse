import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, chromium, type BrowserContext, type Worker } from '@playwright/test';
import type { GestureFrame } from '@gesture/protocol';
import {
  PALM_CLUTCH_MS,
  SCROLL_STEP,
  SCROLL_PX_PER_UNIT,
  MIN_CONFIDENCE,
} from '@gesture/gesture-core';

// Exit check E2. End-to-end vertical slice: a fake-camera extension build with
// the test-only injection hook (Task 4) is driven with a scripted GestureFrame
// sequence — Open_Palm held for PALM_CLUTCH_MS (Arm), then Closed_Fist frames
// with vy >= SCROLL_STEP (Scroll) — through the real offscreen -> service
// worker FSM -> content script path (Tasks 1-5), and asserts the test page's
// `window.scrollY` increases. No trained classifier is exercised (that is the
// fixture-replay's job, E1); this proves the wire-up.
//
// The build here is the SAME default output dir frame-pump.e2e.ts builds into
// (`.output/chrome-mv3`), but with `VITE_TEST_HOOKS=1` so the offscreen
// `__inject_frames` listener (absent from a production build) is present. WXT
// has no supported per-run outDir override reachable without touching
// wxt.config.ts (out of this task's file scope), so a distinct output dir was
// not used; this is safe because each exit check invokes a single spec file in
// isolation (`playwright test -c ... scroll-slice.e2e.ts`), so a run of this
// file never shares a stale build with frame-pump.e2e.ts in the same process.

// `chrome` inside sw.evaluate runs in the service-worker context, not here;
// declare its shape for the closure that sends the injection message.
declare const chrome: {
  runtime: { sendMessage(message: unknown): void };
};

const here = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(here, '..');
const extOut = resolve(extDir, '.output/chrome-mv3');
const y4m = resolve(here, '../../../fixtures/bench/placeholder.y4m');
const pagePath = resolve(here, 'fixtures/scroll-page.html');

function buildExtension(): void {
  if (existsSync(resolve(extOut, 'manifest.json')) && process.env.SCROLL_SKIP_BUILD) return;
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

/** Serves the tall fixture page over http — a content script does not reliably
 * inject into chrome-extension:// or data: pages, only real http(s)/file. */
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

function palmFrame(ts: number): GestureFrame {
  return {
    ts,
    present: true,
    gesture: 'Open_Palm',
    score: MIN_CONFIDENCE + 0.4,
    pinch: 0,
    fingers: [true, true, true, true, true],
    velocity: { vx: 0, vy: 0 },
    scale: 1,
    pointer: { x: 0.5, y: 0.5 },
  };
}

function fistFrame(ts: number, vy: number): GestureFrame {
  return {
    ts,
    present: true,
    gesture: 'Closed_Fist',
    score: MIN_CONFIDENCE + 0.4,
    pinch: 0,
    fingers: [false, false, false, false, false],
    velocity: { vx: 0, vy },
    scale: 1,
    pointer: { x: 0.5, y: 0.5 },
  };
}

/** Palm held >= PALM_CLUTCH_MS clutches Paused -> Armed, then a run of
 * Closed_Fist frames with a strong downward vy drives repeated Scroll
 * intents (`dy = round(vy * SCROLL_PX_PER_UNIT)`, positive vy -> scrollY up). */
function buildFrames(): GestureFrame[] {
  const frames: GestureFrame[] = [palmFrame(0), palmFrame(PALM_CLUTCH_MS)];
  const vy = SCROLL_STEP * 5; // several times the scroll-step threshold
  const fistCount = 6;
  for (let i = 0; i < fistCount; i += 1) {
    frames.push(fistFrame(PALM_CLUTCH_MS + 100 + i * 50, vy));
  }
  return frames;
}

test('fake-camera slice: a scripted gesture scrolls a real page', async () => {
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

    // Bounded settle wait for the content script's port to connect and post
    // `ready`; there is no observable signal to poll from here, so a fixed
    // wait mirrors frame-pump.e2e.ts's warm-up pattern.
    await new Promise((r) => setTimeout(r, 2_000));

    const frames = buildFrames();
    await sw.evaluate(
      (fs) => chrome.runtime.sendMessage({ type: '__inject_frames', frames: fs }),
      frames,
    );

    await page.waitForFunction(() => window.scrollY > 0, { timeout: 30_000 });
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(`[E2] scroll-slice reached window.scrollY=${scrollY}`);
  } finally {
    await context.close();
    server.close();
  }
});
