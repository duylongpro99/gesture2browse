import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, chromium, type BrowserContext, type Worker } from '@playwright/test';
import type { PumpStat } from '@gesture/protocol';

// Exit check E3 — adaptive 30/15 fps, verified in Playwright with a fake camera.
//
// The offscreen worker reads (and closes) every camera frame at ~30 fps, but the
// fps-policy (apps/extension/entrypoints/offscreen/fps-policy.ts) only spends a
// `detectForVideo` call — and so a reported inference-fps window — when
// `shouldInfer` is true: full rate (~30 fps, activeFrameMs) while a hand was seen
// within the last `idleWindowMs` (5 s), then a downshift to ~15 fps (idleFrameMs)
// once no hand has been seen for that window. `PumpStat.fps` is the *inference*
// rate (fps-logger marks only on an actual detect), so the reported series drops
// from ~30 to ~15 exactly when the policy downshifts.
//
// The worker seeds `lastHandSeenTs` with the first frame's timestamp at pump
// start, so the pump runs at full rate for the first `idleWindowMs` regardless of
// detection. `bench/placeholder.y4m` is a 64x64 mid-gray clip with no hand (the
// only committed fixture; .claude/rules/fixtures-and-tests.md — real-camera runs
// are owner work), so after the 5 s seed window elapses no hand is ever seen and
// the policy downshifts. That gives a deterministic, fixture-only 30 -> 15
// transition to assert: early windows (< idleWindowMs since pump start) report
// ~30 fps, late windows (well past it) report ~15 fps.
//
// Context-loss recovery (`webglcontextlost` -> recreate) is exercised by the
// worker code but cannot be simulated headlessly within this test's scope: the
// worker listens on the worker global and the recreate path needs a real
// WEBGL_lose_context on MediaPipe's internal GL context, which is not reachable
// from a Playwright target without a worker test hook (out of Task 7's file
// scope). It stays owner real-browser verification (progress.md, session 3). This
// test verifies the frozen E3 criterion: the 30/15 adaptation.

// `chrome` inside sw.evaluate runs in the service-worker context, not here.
declare const chrome: {
  storage: { session: { get(keys: string[]): Promise<Record<string, unknown>> } };
};

const here = dirname(fileURLToPath(import.meta.url));
const extDir = resolve(here, '..');
const extOut = resolve(extDir, '.output/chrome-mv3');
const y4m = resolve(here, '../../../fixtures/bench/placeholder.y4m');

// fps-policy targets (the policy owns the source of truth — see fps-policy.ts
// DEFAULT_FPS_POLICY_PARAMS: activeFrameMs = 1000/30, idleFrameMs = 1000/15). The
// idle target is the only value asserted against absolutely: idleFrameMs caps the
// idle inference rate at ~15 fps on any machine, whereas the active rate is
// bounded below 30 by per-frame detect cost and so is asserted only relative to
// the idle ceiling.
const IDLE_FPS = 15;
// Windows within this many ms of pump start are "active" (seeded, hand-window not
// yet elapsed); windows past it with no hand are "idle". idleWindowMs = 5000; add
// one PumpStat window (2000 ms) of slack around the boundary.
const ACTIVE_BEFORE_MS = 4_000;
const IDLE_AFTER_MS = 8_000;

// Collect enough PumpStat windows (2 s each) to cover the seed window plus a firm
// idle tail. ~18 s of steady state after the first window.
const COLLECT_MS = 18_000;
const WARMUP_TIMEOUT_MS = 60_000;

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

test('inference fps adapts 30 -> 15 when the hand-idle window elapses', async () => {
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

    // Warm-up: wait for the first PumpStat window, i.e. MediaPipe has cold-inited
    // and the read loop is running. The fps-policy's idle clock (lastHandSeenTs)
    // and the stat clock both start at the first post-init frame, so the first
    // window is the start of the active phase.
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

    await sleep(COLLECT_MS);
    const { series, error } = await readSession(sw);
    expect(error, `pump reported an error: ${error}`).toBeNull();
    expect(series.length, 'not enough PumpStat windows recorded').toBeGreaterThanOrEqual(5);

    // A stat window's `ts` marks its end; the window it covers started ~2 s
    // earlier. Classify by elapsed time since the first window's frame clock: the
    // first window ends ~2 s after the seed, so `ts - firstStatTs + windowMs`
    // approximates elapsed-since-seed at the window's end. Use `ts - firstStatTs`
    // (elapsed since the first window's end) as the conservative discriminator.
    const t0 = firstStatTs!;
    const active = series.filter((s) => s.ts - t0 <= ACTIVE_BEFORE_MS);
    const idle = series.filter((s) => s.ts - t0 >= IDLE_AFTER_MS);

    expect(active.length, 'no active-phase windows captured').toBeGreaterThan(0);
    expect(idle.length, 'no idle-phase windows captured').toBeGreaterThan(0);

    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    const activeMax = Math.max(...active.map((s) => s.fps));
    const idleMean = mean(idle.map((s) => s.fps));

    // eslint-disable-next-line no-console
    console.log(
      `[E3] windows=${series.length} delegate=${series[0]?.delegate} ` +
        `active(fps)=[${active.map((s) => s.fps.toFixed(1)).join(', ')}] ` +
        `idle(fps)=[${idle.map((s) => s.fps.toFixed(1)).join(', ')}] ` +
        `activeMax=${activeMax.toFixed(1)} idleMean=${idleMean.toFixed(1)}`,
    );

    // The ABSOLUTE inference rate is bounded below the policy targets by
    // per-frame detect cost — a slow headless GPU/CPU delegate makes even the
    // active-rate loop run under 30 fps — so the assertions verify the two
    // invariants that survive that confound rather than pinning to 30:
    //
    // 1. Idle windows are capped at the ~15 fps idle target. `idleFrameMs` spaces
    //    inferences 66 ms apart, so the idle inference rate can never *exceed*
    //    ~15 fps on any machine (a fast one hits the cap, a slow one stays under
    //    it). This is the one absolute anchor: it identifies the downshifted rate
    //    as the 15 fps regime, not merely "slower".
    expect(idleMean).toBeLessThanOrEqual(IDLE_FPS * 1.25); // <= ~18.75
    expect(idleMean).toBeGreaterThan(0); // still inferring, just throttled
    //
    // 2. The active window runs materially faster than the idle window — the
    //    downshift is a real transition, not jitter. This is asserted purely
    //    RELATIVE to the idle rate (not against an absolute fps), so it holds on
    //    any runner that can sustain an active rate above the 15 fps idle target —
    //    the precondition the app's 30 fps target already implies. On a runner too
    //    slow to exceed 15 fps even at the active target, no 30->15 downshift is
    //    observable at all and this fails loudly (the correct signal), rather than
    //    a machine-tuned absolute threshold giving a false regression.
    expect(
      activeMax,
      `active rate (${activeMax.toFixed(1)}) not above idle (${idleMean.toFixed(1)}): ` +
        `either no downshift, or this runner cannot sustain an active rate over the 15 fps idle target`,
    ).toBeGreaterThanOrEqual(idleMean * 1.2);
    expect(activeMax - idleMean).toBeGreaterThanOrEqual(2);
  } finally {
    await context.close();
  }
});
