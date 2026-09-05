import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, chromium, type BrowserContext, type Worker } from '@playwright/test';
import type { PumpStat } from '@gesture/protocol';

// Gate G1 / exit check E2. Loads the built unpacked extension with a y4m fake
// camera, lets background.ts create the offscreen document (which drives the
// MediaStreamTrackProcessor -> Worker -> MediaPipe pump), and reads the PumpStat
// series the service worker writes to chrome.storage.session. Asserts sustained
// >= 28 fps over a 60 s window. A shorter warm-up window (model cold-init) is
// discarded. Fixture-first: the y4m is the eyes, no real camera.
//
// "doc hidden": an offscreen document is never rendered and is driven here with
// no foreground surface open (asserted below). Chrome reports document.hidden
// === false for offscreen documents regardless (see docs/spike-results.md §G1 /
// docs/plans/0B-frame-pump.md ## Status), so the gate proves the two testable
// halves of "hidden, no rAF/timer dependence": (1) the built offscreen + worker
// bundles contain no requestAnimationFrame, and (2) the pump sustains the rate
// with no visible surface. The raw hidden flag is recorded, not asserted true.

// `chrome` inside sw.evaluate runs in the service-worker context, not here;
// declare its shape for the closures that read chrome.storage.session.
declare const chrome: {
  storage: { session: { get(keys: string[]): Promise<Record<string, unknown>> } };
};

const here = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(here, '..');
const extOut = resolve(extDir, '.output/chrome-mv3');
const y4m = resolve(here, '../../../fixtures/bench/placeholder.y4m');

const MIN_FPS = 28;
// Overridable for local iteration; the committed gate is 8 s warm-up + 60 s.
const WARMUP_MS = Number(process.env.PUMP_WARMUP_MS ?? 8_000);
const MEASURE_MS = Number(process.env.PUMP_MEASURE_MS ?? 60_000);

function buildExtension(): void {
  if (existsSync(resolve(extOut, 'manifest.json')) && process.env.PUMP_SKIP_BUILD) return;
  execFileSync('pnpm', ['--filter', '@gesture/extension', 'build'], {
    cwd: resolve(extDir, '../..'),
    stdio: 'inherit',
  });
}

/** Bundled JS the offscreen document + its worker actually run. */
function pumpBundles(): string[] {
  const dirs = [join(extOut, 'chunks'), join(extOut, 'assets')];
  const out: string[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if ((name.includes('offscreen') || name.includes('worker')) && name.endsWith('.js')) {
        out.push(join(dir, name));
      }
    }
  }
  return out;
}

async function getServiceWorker(context: BrowserContext): Promise<Worker> {
  const existing = context.serviceWorkers();
  if (existing[0]) return existing[0];
  return context.waitForEvent('serviceworker', { timeout: 30_000 });
}

async function readSession(sw: Worker): Promise<{ series: PumpStat[]; error: string | null }> {
  return sw.evaluate(async () => {
    const s = await chrome.storage.session.get(['pumpSeries', 'pumpError']);
    return {
      series: (s.pumpSeries ?? []) as PumpStat[],
      error: (s.pumpError ?? null) as string | null,
    };
  });
}

test('frame pump sustains >= 28 fps for 60 s from a hidden offscreen doc', async () => {
  buildExtension();

  // No rAF/timer dependence: the capture path must not use requestAnimationFrame.
  const bundles = pumpBundles();
  expect(bundles.length, 'offscreen/worker bundles not found in build output').toBeGreaterThan(0);
  for (const file of bundles) {
    expect(
      readFileSync(file, 'utf8').includes('requestAnimationFrame'),
      `${file} references requestAnimationFrame (pump must not depend on rAF)`,
    ).toBe(false);
  }

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

    // Warm-up: let MediaPipe cold-init and the pump reach steady state.
    await new Promise((r) => setTimeout(r, WARMUP_MS));
    const afterWarmup = await readSession(sw);
    expect(afterWarmup.error, `pump reported an error: ${afterWarmup.error}`).toBeNull();
    const warmupCount = afterWarmup.series.length;

    // No visible surface drives the pump: only the blank foreground page exists.
    expect(
      context.pages().every((p) => p.url() === 'about:blank'),
      `an extension surface was open: ${context.pages().map((p) => p.url()).join(', ')}`,
    ).toBe(true);

    // Measure the gate window.
    await new Promise((r) => setTimeout(r, MEASURE_MS));
    const { series, error } = await readSession(sw);
    expect(error, `pump reported an error: ${error}`).toBeNull();

    // Discard warm-up windows; keep those recorded during the measurement.
    const measured = series.slice(warmupCount);
    expect(
      measured.length,
      `no PumpStat windows recorded during the ${MEASURE_MS} ms measurement`,
    ).toBeGreaterThan(0);

    const fpsValues = measured.map((s) => s.fps).sort((a, b) => a - b);
    const mean = fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length;
    const p05 = fpsValues[Math.floor(fpsValues.length * 0.05)] ?? fpsValues[0]!;
    const worst = fpsValues[0]!;

    // eslint-disable-next-line no-console
    console.log(
      `[G1] windows=${measured.length} delegate=${measured[0]?.delegate} ` +
        `mean=${mean.toFixed(1)} p05=${p05.toFixed(1)} min=${worst.toFixed(1)} fps ` +
        `hidden=${JSON.stringify([...new Set(measured.map((s) => s.hidden))])}`,
    );

    // Sustained: the 5th-percentile window must clear the threshold (a single
    // scheduling hiccup is tolerated, a sustained dip is not).
    expect(p05).toBeGreaterThanOrEqual(MIN_FPS);
  } finally {
    await context.close();
  }
});
