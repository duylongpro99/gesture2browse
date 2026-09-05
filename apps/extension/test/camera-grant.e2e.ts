import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, chromium, type BrowserContext, type Worker } from '@playwright/test';
import type { CameraGrantStatus } from '@gesture/protocol';

// Gate G2 / exit check E2. Loads the built unpacked extension with a y4m fake
// camera and the camera PRE-GRANTED to the context (context.grantPermissions),
// and WITHOUT --use-fake-ui-for-media-stream — so the grant/offscreen path is
// exercised from a real origin grant, not an auto-accepted prompt. Asserts:
//   (a) the grant page's permissions.query pre-check reads `granted` and
//       getUserMedia resolves with no prompt (its status region reports granted);
//   (b) CameraGrantStatus { state:'granted', persistent:true, source:'grant-page' }
//       lands in chrome.storage.session;
//   (c) the background pre-check gate does NOT open a grant tab when the origin is
//       already granted, and the offscreen getUserMedia succeeds (a PumpStat with
//       no error is recorded after the gate re-runs).
// The Chrome-restart survival and the live "Allow this time" revert are owner
// checks (a browser restart is outside Playwright); recorded in spike-results §G2.

declare const chrome: {
  runtime: {
    getURL(path: string): string;
    sendMessage(msg: unknown): Promise<unknown>;
  };
  storage: { session: { get(keys: string[]): Promise<Record<string, unknown>> } };
};

const here = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(here, '..');
const extOut = resolve(extDir, '.output/chrome-mv3');
const y4m = resolve(here, '../../../fixtures/bench/placeholder.y4m');

function buildExtension(): void {
  if (existsSync(resolve(extOut, 'manifest.json')) && process.env.PUMP_SKIP_BUILD) return;
  execFileSync('pnpm', ['--filter', '@gesture/extension', 'build'], {
    cwd: resolve(extDir, '../..'),
    stdio: 'inherit',
  });
}

async function getServiceWorker(context: BrowserContext): Promise<Worker> {
  const existing = context.serviceWorkers();
  if (existing[0]) return existing[0];
  return context.waitForEvent('serviceworker', { timeout: 30_000 });
}

function readSession<T>(sw: Worker, key: string): Promise<T | null> {
  return sw.evaluate(async (k) => {
    const s = await chrome.storage.session.get([k]);
    return (s[k] ?? null) as T | null;
  }, key);
}

interface Precheck {
  granted: boolean;
  openedGrantTab: boolean;
  queryAnswered: boolean;
  source: string;
  state: string;
}

test('camera grant page + background pre-check gate with a pre-granted permission', async () => {
  buildExtension();

  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    // Fake device + y4m, but NOT --use-fake-ui-for-media-stream: the grant comes
    // from context.grantPermissions below, i.e. a real origin grant.
    args: [
      `--disable-extensions-except=${extOut}`,
      `--load-extension=${extOut}`,
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${y4m}`,
    ],
  });

  try {
    // Pre-grant the camera to every origin in the context (includes the
    // chrome-extension:// origin) before getUserMedia runs anywhere.
    await context.grantPermissions(['camera']);

    const sw = await getServiceWorker(context);
    const origin = await sw.evaluate(() => chrome.runtime.getURL('/'));

    // (a) Drive the full-tab grant page.
    const page = await context.newPage();
    await page.goto(`${origin}grant-camera.html`);
    await expect(page.getByTestId('precheck')).toHaveText('granted', { timeout: 15_000 });
    await expect(page.getByTestId('status')).toContainText(/granted/i, { timeout: 15_000 });
    // The page never rendered video: no media element exists on it.
    expect(await page.locator('video, canvas').count()).toBe(0);

    // (b) CameraGrantStatus persisted by the grant page.
    await expect
      .poll(() => readSession<CameraGrantStatus>(sw, 'cameraGrantStatus'), { timeout: 15_000 })
      .not.toBeNull();
    const status = (await readSession<CameraGrantStatus>(sw, 'cameraGrantStatus'))!;
    expect(status.state).toBe('granted');
    expect(status.persistent).toBe(true);
    expect(status.source).toBe('grant-page');

    // (c) Re-run the background gate; with the origin granted it must not open a
    // grant tab and must (re)start the offscreen pump successfully. Sent from the
    // page context (a service worker never receives its own runtime.sendMessage);
    // the no-response rejection is expected and ignored — the handler still runs.
    await page.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'RunCameraPrecheck' }).catch(() => undefined),
    );
    await expect
      .poll(() => readSession<Precheck>(sw, 'cameraPrecheck'), { timeout: 15_000 })
      .not.toBeNull();
    const precheck = (await readSession<Precheck>(sw, 'cameraPrecheck'))!;
    // eslint-disable-next-line no-console
    console.log(`[G2] precheck=${JSON.stringify(precheck)}`);
    expect(precheck.granted).toBe(true);
    expect(precheck.openedGrantTab).toBe(false);

    // No extra grant tab was auto-opened by the gate: only the one we opened.
    const grantTabs = context.pages().filter((p) => p.url().includes('grant-camera.html'));
    expect(grantTabs.length).toBe(1);

    // Offscreen getUserMedia succeeds: a PumpStat is recorded with no error.
    await expect
      .poll(
        async () => {
          const series = await readSession<unknown[]>(sw, 'pumpSeries');
          return Array.isArray(series) ? series.length : 0;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
    const pumpError = await readSession<string>(sw, 'pumpError');
    expect(pumpError, `offscreen pump reported an error: ${pumpError}`).toBeNull();
  } finally {
    await context.close();
  }
});
