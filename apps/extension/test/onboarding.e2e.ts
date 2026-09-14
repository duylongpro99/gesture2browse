import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import {
  OnboardingStateSchema,
  SettingsSchema,
  type CameraGrantStatus,
} from '@gesture/protocol';

// Milestone 1D.1 / roadmap §4.4 Exit (checks E1 + E2) and the impl-plan Task 5.
// Loads the built unpacked extension with a y4m fake camera
// (.claude/rules/fixtures-and-tests.md), opens the full-tab onboarding wizard, and:
//   - walks the happy path Welcome → (Camera auto-satisfied by a seeded persistent
//     CameraGrantStatus, the grant-page handoff the flow spec fixes) → SiteAccess →
//     Profile → Ready, using the KEYBOARD ONLY (Tab/Enter, no pointer) — the
//     screen-reader/keyboard requirement — asserting focus lands on each new step's
//     heading and that an aria-live status region is present;
//   - asserts the onboarding page renders no <video>/<canvas>: it reads device kind
//     + permission state only, capture/grant stay in grant-camera (arch §1/§6);
//   - asserts Settings round-trips through chrome.storage.sync and re-parses with
//     SettingsSchema (E2), and OnboardingState.completed lands in storage.local;
//   - captures apps/extension/test-results/onboarding.png for the owner's E1 review;
//   - covers the required unhappy paths: no webcam present (dead-end + Recheck, no
//     hang), a non-persistent / denied grant ("Allow this time") → re-route guidance,
//     and a withheld <all_urls> → degraded copy with grant/continue-limited controls.
// The owner's visual review of the screenshot is E1 (owner-only; journal
// `### Owner steps`); this test produces the artifact and asserts everything
// mechanical.

declare const chrome: {
  runtime: { getURL(path: string): string };
  storage: {
    session: {
      get(keys: string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
    sync: { get(keys: string[]): Promise<Record<string, unknown>> };
    local: { get(keys: string[]): Promise<Record<string, unknown>> };
  };
  permissions: { contains: unknown; request: unknown };
};

const here = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(here, '..');
const extOut = resolve(extDir, '.output/chrome-mv3');
const y4m = resolve(here, '../../../fixtures/bench/placeholder.y4m');
const screenshotPath = resolve(here, '../test-results/onboarding.png');

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

/** Seed (or overwrite) the CameraGrantStatus the grant page normally writes. */
function seedGrant(sw: Worker, status: CameraGrantStatus): Promise<void> {
  return sw.evaluate(async (s) => {
    await chrome.storage.session.set({ cameraGrantStatus: s });
  }, status);
}

const persistentGrant: CameraGrantStatus = {
  ts: 1000,
  state: 'granted',
  persistent: true,
  source: 'grant-page',
};

/** The testid of the currently focused element, or null. */
function activeTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
}

/** The id of the currently focused element, or null. */
function activeId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.id ?? null);
}

/** Press Tab until the focused element carries `testid` (keyboard-only navigation). */
async function tabTo(page: Page, testid: string, max = 8): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if ((await activeTestId(page)) === testid) return;
  }
  throw new Error(`Tab did not reach ${testid} within ${max} presses`);
}

test('onboarding happy path (keyboard) → settings round-trip + screenshot', async () => {
  buildExtension();
  mkdirSync(dirname(screenshotPath), { recursive: true });

  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    // Fake camera per .claude/rules/fixtures-and-tests.md; --use-fake-ui auto-accepts
    // any getUserMedia the SW's post-onboarding pump may start, so no prompt strands
    // the run. The onboarding page itself never calls getUserMedia — the device is
    // only there so enumerateDevices reports a videoinput (camera "present").
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
    const origin = await sw.evaluate(() => chrome.runtime.getURL('/'));

    // Camera step is satisfied by a persistent grant already recorded (the flow hands
    // off to grant-camera for the real grant; here we seed its result so the harness
    // does not need to drive that separate page).
    await seedGrant(sw, persistentGrant);

    const page = await context.newPage();
    await page.goto(`${origin}onboarding.html`);

    // Welcome renders; an aria-live status region is present (screen-reader path).
    await expect(page.getByTestId('step-welcome')).toBeVisible({ timeout: 15_000 });
    const statusRegion = page.getByTestId('status');
    await expect(statusRegion).toHaveAttribute('role', 'status');
    await expect(statusRegion).toHaveAttribute('aria-live', 'polite');
    // The onboarding page renders no raw video: readouts only (arch §1/§6).
    expect(await page.locator('video, canvas').count()).toBe(0);
    // Focus lands on the active step's heading on entry.
    await expect.poll(() => activeId(page), { timeout: 5_000 }).toBe('welcome-heading');

    // Welcome → (Camera auto-satisfied by the seeded grant) → Site access.
    await tabTo(page, 'welcome-continue');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('step-site-access')).toBeVisible();
    await expect.poll(() => activeId(page)).toBe('site-heading');
    // <all_urls> is a declared (non-optional) host permission → full access.
    await expect(page.getByTestId('site-full')).toBeVisible();

    // Site access → Profile.
    await tabTo(page, 'site-continue');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('step-profile')).toBeVisible();
    await expect.poll(() => activeId(page)).toBe('profile-heading');
    // Accessibility is the default (Maya, the primary MVP user).
    await expect(page.getByTestId('profile-accessibility')).toBeChecked();

    // Profile → Ready (writes Settings.profile to storage.sync).
    await tabTo(page, 'profile-continue');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('step-ready')).toBeVisible();
    await expect.poll(() => activeId(page)).toBe('ready-heading');

    // E2 — Settings round-trips through chrome.storage.sync and re-parses with the
    // protocol schema; the chosen profile is the Accessibility default.
    const readSettings = () =>
      sw.evaluate(async () => (await chrome.storage.sync.get(['settings'])).settings ?? null);
    await expect.poll(readSettings, { timeout: 15_000 }).not.toBeNull();
    const settings = SettingsSchema.parse(await readSettings());
    expect(settings.profile).toBe('accessibility');

    // OnboardingState.completed is persisted to storage.local (the background gate reads it).
    const onboardingRaw = await sw.evaluate(
      async () => (await chrome.storage.local.get(['onboardingState'])).onboardingState ?? null,
    );
    const onboarding = OnboardingStateSchema.parse(onboardingRaw);
    expect(onboarding.completed).toBe(true);

    // E1 — capture the screenshot the owner reviews.
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(existsSync(screenshotPath)).toBe(true);
  } finally {
    await context.close();
  }
});

test('onboarding unhappy paths: no webcam, grant re-route, restricted host access', async () => {
  buildExtension();

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
    const origin = await sw.evaluate(() => chrome.runtime.getURL('/'));

    // (1) No webcam present → dead-end copy + Recheck, no hang. enumerateDevices is
    // overridden to report no videoinput; the fake device stays on the context to
    // satisfy the fixtures rule.
    const noCam = await context.newPage();
    await noCam.addInitScript(() => {
      navigator.mediaDevices.enumerateDevices = (async () => [
        { kind: 'audioinput', deviceId: '', groupId: '', label: '' } as MediaDeviceInfo,
      ]) as typeof navigator.mediaDevices.enumerateDevices;
    });
    await noCam.goto(`${origin}onboarding.html`);
    await noCam.getByTestId('welcome-continue').click();
    await expect(noCam.getByTestId('camera-absent')).toBeVisible({ timeout: 15_000 });
    await expect(noCam.getByTestId('camera-recheck')).toBeVisible();
    await noCam.close();

    // (2) Camera "Allow this time" / denied → re-route guidance. Seed a
    // non-persistent grant, then a denial; both must show the try-again handoff.
    for (const grant of [
      { ts: 2000, state: 'granted', persistent: false, source: 'grant-page' } as CameraGrantStatus,
      { ts: 3000, state: 'denied', persistent: false, source: 'grant-page' } as CameraGrantStatus,
    ]) {
      await seedGrant(sw, grant);
      const reroute = await context.newPage();
      await reroute.goto(`${origin}onboarding.html`);
      await reroute.getByTestId('welcome-continue').click();
      await expect(reroute.getByTestId('camera-reroute')).toBeVisible({ timeout: 15_000 });
      await expect(reroute.getByTestId('camera-retry')).toBeVisible();
      await reroute.close();
    }

    // (3) Restricted <all_urls> → degraded copy + grant/continue-limited controls, and
    // continue-in-limited still advances. permissions.contains is overridden to report
    // the host access withheld; the seeded persistent grant lets the camera step pass.
    await seedGrant(sw, persistentGrant);
    const restricted = await context.newPage();
    await restricted.addInitScript(() => {
      try {
        chrome.permissions.contains = () => Promise.resolve(false);
        chrome.permissions.request = () => Promise.resolve(false);
      } catch {
        // If the API object is not writable, redefine the whole namespace.
        Object.defineProperty(chrome, 'permissions', {
          configurable: true,
          value: {
            contains: () => Promise.resolve(false),
            request: () => Promise.resolve(false),
          },
        });
      }
    });
    await restricted.goto(`${origin}onboarding.html`);
    await restricted.getByTestId('welcome-continue').click();
    await expect(restricted.getByTestId('step-site-access')).toBeVisible({ timeout: 15_000 });
    await expect(restricted.getByTestId('site-restricted')).toBeVisible();
    await expect(restricted.getByTestId('site-grant')).toBeVisible();
    await expect(restricted.getByTestId('site-limited')).toBeVisible();
    // Continue-degraded works: limited mode advances past site access.
    await restricted.getByTestId('site-limited').click();
    await expect(restricted.getByTestId('step-profile')).toBeVisible();
    await restricted.close();
  } finally {
    await context.close();
  }
});
