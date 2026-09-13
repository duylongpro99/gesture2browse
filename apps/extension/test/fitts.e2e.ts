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

// Exit check E1 — Fitts. Drives the same fake-camera + `__inject_frames` test
// hook as scroll-slice.e2e.ts (the golden harness), but instead of scrolling it
// scripts the full pointer→pinch-tap click path (Tasks 4–6): each of a 9-target
// ring is made the active target, the normalized pointer is parked over it (so
// the content script snaps + round-trips a PageEvent.hover, which the SW latches
// as `lastHover`), then a pinch-in/out within TAP_MAX_MS fires Click{hoverId} →
// dispatcher → synthetic fallbackClick on the element. The fixture records
// acquisition time (clickTs − activeTs) and hit/miss; this asserts median
// acquisition ≤ 1.8 s and precision ≥ 0.95 (roadmap §4.6). All gesture timing is
// imported from gesture-core; no threshold literal is duplicated here.

// `chrome` inside sw.evaluate runs in the service-worker context, not here.
declare const chrome: {
  runtime: { sendMessage(message: unknown): void };
};

// `window.__fitts` is defined by fixtures/fitts-page.html; declared here for the
// page.evaluate closures that read it back.
interface FittsRecord {
  index: number;
  intended: number | null;
  activeTs: number;
  clickTs: number;
  isTrusted: boolean;
  hit: boolean;
}
declare global {
  interface Window {
    __fitts: {
      active: number | null;
      activeTs: number;
      records: FittsRecord[];
      activate(i: number): void;
    };
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(here, '..');
const extOut = resolve(extDir, '.output/chrome-mv3');
const y4m = resolve(here, '../../../fixtures/bench/placeholder.y4m');
const pagePath = resolve(here, 'fixtures/fitts-page.html');

const SCORE = MIN_CONFIDENCE + 0.4;
const STEP_MS = 100; // logical ms between injected frames (frame ts spacing)
// Wall-clock settle so the parked-pointer hover round-trips (content → SW
// `lastHover`) before the pinch frame latches the target. The frame ts spacing
// above is logical; this is the real async messaging lag the brief calls out.
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

test('fitts: scripted pinch-taps acquire a ring of 40 px targets', async () => {
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

    // Let the content-script port connect and post `ready` (no observable signal
    // to poll from here; mirrors scroll-slice's warm-up wait).
    await new Promise((r) => setTimeout(r, 2_000));

    // Read each target's live normalized centre (viewport fractions), so the
    // injected pointer maps to the same CSS px the content script snaps against.
    const targets = await page.evaluate(() => {
      const iw = window.innerWidth;
      const ih = window.innerHeight;
      return Array.from(document.querySelectorAll('button.target'))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            index: Number((el as HTMLElement).dataset.index),
            x: (r.x + r.width / 2) / iw,
            y: (r.y + r.height / 2) / ih,
          };
        })
        .sort((a, b) => a.index - b.index);
    });
    expect(targets.length).toBe(9);

    let ts = 0;
    const center: Pointer = { x: 0.5, y: 0.5 };

    // Arm: hold Open_Palm past PALM_CLUTCH_MS + STABLE_TRACK_MS (+ headroom) so
    // the clutch fires and the stable-track gate opens for later pinches.
    const armFrames: GestureFrame[] = [];
    const armEnd = PALM_CLUTCH_MS + STABLE_TRACK_MS + 300;
    for (; ts <= armEnd; ts += STEP_MS) armFrames.push(palmFrame(ts, center));
    await inject(sw, armFrames);
    await new Promise((r) => setTimeout(r, 300));

    for (const tgt of targets) {
      const pt: Pointer = { x: tgt.x, y: tgt.y };
      const before = await page.evaluate(() => window.__fitts.records.length);
      await page.evaluate((i) => window.__fitts.activate(i), tgt.index);

      // Park the pointer over the target for a few frames. The first frame after
      // a jump reads a high pointer speed (snapping suppressed); the following
      // frames read speed 0 and snap, so the hover round-trips.
      const park: GestureFrame[] = [];
      for (let k = 0; k < 3; k += 1) {
        ts += STEP_MS;
        park.push(pointFrame(ts, pt, 1));
      }
      await inject(sw, park);
      await new Promise((r) => setTimeout(r, HOVER_SETTLE_MS));

      // Pinch in then out within TAP_MAX_MS → a tap Click on the latched hover.
      ts += STEP_MS;
      const pinchIn = pointFrame(ts, pt, PINCH_IN - 0.05);
      ts += Math.round(TAP_MAX_MS / 2);
      const pinchOut = pointFrame(ts, pt, PINCH_OUT + 0.05);
      await inject(sw, [pinchIn, pinchOut]);

      // Wait for this target's click to land (or time out → recorded as a miss).
      await page
        .waitForFunction((b) => window.__fitts.records.length > b, before, {
          timeout: 4_000,
        })
        .catch(() => {});
    }

    const records = await page.evaluate(() => window.__fitts.records);

    const attempts = targets.length;
    const hits = records.filter((r) => r.hit);
    const precision = hits.length / attempts;

    const acquisitions = hits
      .map((r) => r.clickTs - r.activeTs)
      .sort((a, b) => a - b);
    const median =
      acquisitions[Math.floor((acquisitions.length - 1) / 2)] ??
      Number.POSITIVE_INFINITY;

    // eslint-disable-next-line no-console
    console.log(
      `[E1] fitts: attempts=${attempts} hits=${hits.length} precision=${precision.toFixed(3)} ` +
        `medianAcquisitionMs=${Math.round(median)} synthetic=${records.filter((r) => !r.isTrusted).length}`,
    );

    expect(precision).toBeGreaterThanOrEqual(0.95);
    expect(median).toBeLessThanOrEqual(1_800);
  } finally {
    await context.close();
    server.close();
  }
});
