import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, chromium, type BrowserContext, type Worker } from '@playwright/test';
import type { PumpStat } from '@gesture/protocol';

// Gate G1 (milestone 0B). Loads the built unpacked extension with a y4m fake
// camera, lets background.ts create the offscreen document (which drives the
// MediaStreamTrackProcessor -> Worker -> MediaPipe pump), and reads the PumpStat
// series the service worker writes to chrome.storage.session. Asserts the pump
// sustains >= 28 fps from a hidden offscreen doc while it is inferring at the
// active rate. Fixture-first: the y4m is the eyes, no real camera.
//
// Idle-aware (Task 10 / milestone 1B). Task 5's adaptive fps-policy
// (apps/extension/entrypoints/offscreen/fps-policy.ts) seeds `lastHandSeenTs` at
// pump start and holds the active target rate (activeFrameMs = ~30 fps) for the
// first `idleWindowMs` (5 s); `PumpStat.fps` is the *inference* rate, marked only
// on an actual detect. `bench/placeholder.y4m` is a hand-less clip, so once the
// seed window elapses the policy deliberately downshifts to the ~15 fps idle
// target (idleFrameMs) and never resumes — an intended power saving, not a stall.
// The G1 throughput gate therefore measures the ACTIVE SEED WINDOW only: the
// fully-active PumpStat windows before the downshift. Measuring the whole run (as
// this gate did before adaptive fps) would average in the intended 15 fps idle
// tail and can never clear 28 on any hardware. A hand-present / real-camera
// sustained run is owner work (.claude/rules/fixtures-and-tests.md).
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
// fps-policy DEFAULT_FPS_POLICY_PARAMS.idleWindowMs — the active seed window: the
// policy runs at the active target for this long from pump start before the
// no-hand downshift. Mirrored here (the policy owns the source of truth).
const IDLE_WINDOW_MS = 5_000;
// offscreen/main.ts stat window: each PumpStat covers this trailing span, so a
// window whose end ts is `e` ms past the seed covers `[e - WINDOW_MS, e]`.
const WINDOW_MS = 2_000;
// Collect enough windows to span the seed window plus a firm idle tail (used only
// as a relative cross-check that the active windows really are the active regime).
// Overridable for local iteration.
const COLLECT_MS = Number(process.env.PUMP_MEASURE_MS ?? 12_000);
const WARMUP_TIMEOUT_MS = 60_000;

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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const p05Of = (fps: number[]): number => {
  const sorted = [...fps].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.05)] ?? sorted[0]!;
};
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

test('frame pump sustains >= 28 fps in its active window from a hidden offscreen doc', async () => {
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

    // Warm-up: poll until the first PumpStat window appears — MediaPipe has
    // cold-inited and the read loop is running. That first window (series[0]) also
    // carries MediaPipe's cold-init / shader-compile spike (session-5 finding 3),
    // so it is the warm-up window; its `ts` fixes the seed clock for classifying
    // the windows that follow. The fps-policy's idle clock (lastHandSeenTs) and
    // the stat clock both start at the first post-init frame, ~WINDOW_MS before
    // this first window ends.
    const warmupDeadline = Date.now() + WARMUP_TIMEOUT_MS;
    let firstStatTs: number | null = null;
    while (Date.now() < warmupDeadline) {
      const { series, error } = await readSession(sw);
      expect(error, `pump reported an error during warm-up: ${error}`).toBeNull();
      if (series.length > 0) {
        firstStatTs = series[0]!.ts;
        break;
      }
      await sleep(500);
    }
    expect(firstStatTs, 'no PumpStat window appeared within the warm-up timeout').not.toBeNull();

    // No visible surface drives the pump: only the blank foreground page exists.
    expect(
      context.pages().every((p) => p.url() === 'about:blank'),
      `an extension surface was open: ${context.pages().map((p) => p.url()).join(', ')}`,
    ).toBe(true);

    await sleep(COLLECT_MS);
    const { series, error } = await readSession(sw);
    expect(error, `pump reported an error: ${error}`).toBeNull();
    expect(series.length, 'no PumpStat windows recorded').toBeGreaterThan(0);

    // The first window's end ts is ~WINDOW_MS past the seed, so `seed` recovers
    // the pump-start clock the fps-policy measures its idle window from.
    const seed = firstStatTs! - WINDOW_MS;
    // A window ending `end` ms past the seed covers `[end - WINDOW_MS, end]`.
    //   - active: that whole span lies inside the [0, idleWindowMs] active phase,
    //     i.e. `end <= idleWindowMs`, and it is not the cold warm-up window
    //     (`end > WINDOW_MS`, with slack for stat-clock jitter). These are the
    //     fully-active windows the G1 throughput gate measures.
    //   - idle: the whole span lies past the downshift (`end - WINDOW_MS >=
    //     idleWindowMs`). Used only as a relative cross-check.
    // Windows straddling the 5 s boundary (mixing active- and idle-rate marks)
    // fall into neither set and are ignored.
    const endMs = (s: PumpStat): number => s.ts - seed;
    const active = series.filter((s) => endMs(s) > WINDOW_MS + 500 && endMs(s) <= IDLE_WINDOW_MS);
    const idle = series.filter((s) => endMs(s) - WINDOW_MS >= IDLE_WINDOW_MS);

    const activeFps = active.map((s) => s.fps);
    const idleFps = idle.map((s) => s.fps);
    const activeP05 = active.length > 0 ? p05Of(activeFps) : NaN;

    // eslint-disable-next-line no-console
    console.log(
      `[G1] windows=${series.length} delegate=${series[0]?.delegate} ` +
        `active(fps)=[${activeFps.map((f) => f.toFixed(1)).join(', ')}] p05=${activeP05.toFixed(1)} ` +
        `idle(fps)=[${idleFps.map((f) => f.toFixed(1)).join(', ')}] ` +
        `hidden=${JSON.stringify([...new Set(series.map((s) => s.hidden))])}`,
    );

    expect(
      active.length,
      'no fully-active PumpStat window captured before the fps-policy idle downshift',
    ).toBeGreaterThan(0);

    // Cross-check that the active windows really are the active regime and not a
    // mis-classified idle window: they must run materially faster than the idle
    // tail. Purely relative, so it holds on any runner (the absolute rate is
    // bounded below the target by per-frame detect cost). Skipped if the run was
    // too short to reach a fully-idle window.
    if (idle.length > 0) {
      expect(
        activeP05,
        `active p05 (${activeP05.toFixed(1)}) not above the idle tail (${mean(idleFps).toFixed(1)}) — ` +
          'active window may be mis-classified',
      ).toBeGreaterThan(mean(idleFps));
    }

    // The G1 gate: the active window's 5th-percentile inference rate clears
    // 28 fps (a single scheduling hiccup tolerated, a sustained dip is not). This
    // is the absolute throughput claim G1 was validated on owner hardware
    // (docs/spike-results.md §G1 — GO); a headless runner's per-frame detect cost
    // can cap even the active rate below 28, so a red here on CI is the
    // owner-hardware signal, not a 1B exit-check regression (1B exit checks are
    // E1-E3; frame-pump is 0B's gate and is not in the vitest run).
    expect(activeP05).toBeGreaterThanOrEqual(MIN_FPS);
  } finally {
    await context.close();
  }
});
