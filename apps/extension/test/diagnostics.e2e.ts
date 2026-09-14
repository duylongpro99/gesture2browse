import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, chromium, type BrowserContext, type Worker } from '@playwright/test';
import {
  DiagnosticsConfigSchema,
  DiagnosticsExportSchema,
  FalsePositiveEntrySchema,
  type DiagnosticsExport,
  type FalsePositiveEntry,
  type PumpStat,
  type TransitionLogEntry,
} from '@gesture/protocol';
import {
  fixtureFromDiagnostics,
  framesFromDiagnostics,
  replayFixture,
  replayFrames,
} from '@gesture/gesture-core';

// Milestone 1D.5 / roadmap §4.4 Exit (checks E1 + E2). Loads the built unpacked
// extension with a y4m fake camera (.claude/rules/fixtures-and-tests.md), seeds the
// diagnostic snapshots the service worker normally writes into
// chrome.storage.session, opens the full-tab diagnostics page, and asserts:
//   - the fps / per-stage-timing / dropped-frame readouts, transition stream, and
//     false-positive list render from the seeded blobs (the page reads storage; it
//     renders numbers + a landmark-frame COUNT, never raw video — no <video>/<canvas>);
//   - flagging a false positive round-trips page→SW→storage: a new schema-valid
//     FalsePositiveEntry is appended to the persisted series;
//   - the record-landmarks config round-trips page→SW→storage and re-validates
//     against DiagnosticsConfigSchema (E2: "settings round-trip through
//     chrome.storage validated by the protocol schema");
//   - Export downloads JSON that parses as DiagnosticsExport and round-trips through
//     the Task-5 replay helpers (framesFromDiagnostics→replayFrames, and — because a
//     seeded entry carries a landmark window — fixtureFromDiagnostics→replayFixture);
//   - a full-page screenshot is captured for the owner's E1 review (test-results/).
// The owner's visual review of that screenshot is E1 (owner-only; journal
// `### Owner steps`); this test produces the artifact and asserts everything
// mechanical.

declare const chrome: {
  runtime: { getURL(path: string): string };
  storage: {
    session: {
      get(keys: string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
};

const here = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(here, '..');
const extOut = resolve(extDir, '.output/chrome-mv3');
const y4m = resolve(here, '../../../fixtures/bench/placeholder.y4m');
const screenshotPath = resolve(here, '../test-results/diagnostics.png');

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

// A representative diagnostic snapshot, valid against the protocol schemas. The
// single false positive carries BOTH a feature window (always) and a landmark
// window (armed-only, Q3=C) so the Export→replay round-trip exercises both the
// FSM-level and the full-pipeline path.
const seededPump: PumpStat = {
  ts: 1000,
  fps: 28.5,
  frames: 57,
  windowMs: 2000,
  delegate: 'webgl',
  hidden: true,
  dropped: 3,
  stages: { captureMs: 1.2, inferMs: 8.4, normalizeMs: 0.5, classifyMs: 0.9, filterMs: 0.3 },
};

const seededTransitions: TransitionLogEntry[] = [
  { ts: 1200, from: 'idle', to: 'pointing', event: 'HAND_PRESENT' },
  { ts: 1500, from: 'pointing', to: 'pinch', event: 'PINCH_START' },
];

const seededFalsePositive: FalsePositiveEntry = {
  ts: 5000,
  eventTs: 1500,
  note: 'seeded',
  transition: seededTransitions[1],
  frameWindow: [
    { ts: 1467, present: true, gesture: 'Closed_Fist', score: 0.72, pinch: 0.02, velocity: { vx: 0, vy: 0.1 } },
    { ts: 1500, present: true, gesture: 'Closed_Fist', score: 0.71, pinch: 0.02, velocity: { vx: 0, vy: 0.1 } },
  ],
  landmarkWindow: [
    { ts: 1467, present: true, landmarks: Array(63).fill(0.1), score: 0.72 },
    { ts: 1500, present: true, landmarks: Array(63).fill(0.1), score: 0.71 },
  ],
};

test('diagnostics page: render, annotate, config round-trip, export→replay, screenshot', async () => {
  buildExtension();
  mkdirSync(dirname(screenshotPath), { recursive: true });

  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    acceptDownloads: true,
    // Fake camera per .claude/rules/fixtures-and-tests.md; the page never starts the
    // pump (it reads seeded storage), so the device is only there to satisfy the rule.
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

    // Seed the snapshots the SW normally writes, from the SW context.
    await sw.evaluate(
      async ({ pump, transitions, falsePositive }) => {
        await chrome.storage.session.set({
          pumpSeries: [pump],
          transitionSeries: transitions,
          transitionLatest: transitions[transitions.length - 1],
          falsePositiveSeries: [falsePositive],
          diagnosticsConfig: { recordLandmarks: false },
        });
      },
      { pump: seededPump, transitions: seededTransitions, falsePositive: seededFalsePositive },
    );

    const page = await context.newPage();
    await page.goto(`${origin}diagnostics.html`);

    // (1) Readouts render from the seeded blobs.
    await expect(page.getByTestId('fps')).toHaveText('28.5 fps', { timeout: 15_000 });
    await expect(page.getByTestId('dropped')).toHaveText('dropped: 3');
    await expect(page.getByTestId('stage-infer')).toContainText('8.4 ms');
    await expect(page.getByTestId('stage-capture')).toContainText('1.2 ms');
    await expect(page.getByTestId('transition-stream').locator('li')).toHaveCount(2);
    await expect(page.getByTestId('false-positive-list').locator('li')).toHaveCount(1);
    // The page draws numbers + landmark COUNTS, never raw video.
    expect(await page.locator('video, canvas').count()).toBe(0);
    await expect(page.getByTestId('false-positive-list')).toContainText('2 landmark frames');

    // (2) Flag a false positive: page→SW→storage appends a schema-valid entry.
    await page.getByTestId('flag-fp').click();
    await expect
      .poll(
        async () => {
          const s = await sw.evaluate(async () => {
            const r = await chrome.storage.session.get(['falsePositiveSeries']);
            return (r.falsePositiveSeries as unknown[] | undefined)?.length ?? 0;
          });
          return s;
        },
        { timeout: 15_000 },
      )
      .toBe(2);
    const persistedFps = await sw.evaluate(async () => {
      const r = await chrome.storage.session.get(['falsePositiveSeries']);
      return r.falsePositiveSeries as unknown[];
    });
    // Every persisted entry validates against the protocol schema, and the flagged
    // one adopted the last transition's ts as its eventTs (the page's behaviour).
    for (const entry of persistedFps) {
      expect(FalsePositiveEntrySchema.safeParse(entry).success).toBe(true);
    }
    expect(FalsePositiveEntrySchema.parse(persistedFps[1]).eventTs).toBe(1500);

    // (3) E2 — config round-trip through chrome.storage, validated by the schema.
    await page.getByTestId('record-landmarks').check();
    await expect
      .poll(
        async () => {
          const cfg = await sw.evaluate(async () => {
            const r = await chrome.storage.session.get(['diagnosticsConfig']);
            return r.diagnosticsConfig ?? null;
          });
          return DiagnosticsConfigSchema.safeParse(cfg).data?.recordLandmarks ?? null;
        },
        { timeout: 15_000 },
      )
      .toBe(true);

    // (4) Export → replay round-trip through the Task-5 helpers.
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export').click();
    const download = await downloadPromise;
    const filePath = await download.path();
    const exportRaw: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    const parsed = DiagnosticsExportSchema.safeParse(exportRaw);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    const exp: DiagnosticsExport = parsed.data!;
    expect(exp.falsePositives.length).toBeGreaterThan(0);

    // The seeded entry (with a landmark window) round-trips through BOTH replay paths.
    const seeded = exp.falsePositives.find((fp) => fp.landmarkWindow && fp.landmarkWindow.length > 0);
    expect(seeded, 'export should retain the seeded landmark-bearing false positive').toBeDefined();
    const frames = framesFromDiagnostics(seeded!);
    expect(frames.length).toBe(2);
    expect(() => replayFrames(frames)).not.toThrow();
    const fixture = fixtureFromDiagnostics(seeded!);
    expect(fixture).not.toBeNull();
    expect(fixture!.frames[0]?.landmarks).toHaveLength(63);
    expect(() => replayFixture(fixture!)).not.toThrow();

    // (5) E1 — capture the screenshot the owner reviews.
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(existsSync(screenshotPath)).toBe(true);
  } finally {
    await context.close();
  }
});
