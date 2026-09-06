import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { BENCH_COLUMNS } from '@gesture/protocol';

// G3 bench matrix sweep (roadmap §7 G3, spike-results §G3). Runs the committed 0A
// bench page across delegate x recognizer x resolution on ONE machine and writes
// the combined CSV to fixtures/bench/<DEVICE>.csv. The placeholder y4m (no hand)
// is fed as a fake camera: G3 measures throughput (fps, inferMs, coldInit), not
// detection, so a no-hand feed yields valid perf numbers (see src/bench.ts).
//
// NOTE: 0A wires only HandLandmarker; the `gesturerecognizer` cells fall back to
// it (the row's `notes` records this), so the recognizer axis of the B3 matrix is
// not yet distinguished — call that out when filling §G3.
//
// Env: DEVICE (machine label, required for a meaningful filename), FRAMES
// (default 600, ~20s/combo; use >=600 for stable p05/p50), NUM_HANDS (default 1).

const DELEGATES = ['wasm', 'webgl'] as const;
const RECOGNIZERS = ['handlandmarker', 'gesturerecognizer'] as const;
const RESOLUTIONS = ['480p', '720p'] as const;

const DEVICE = process.env.DEVICE ?? 'unknown';
const FRAMES = Number(process.env.FRAMES ?? '600');
const NUM_HANDS = Number(process.env.NUM_HANDS ?? '1');

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../../fixtures/bench'); // apps/playground/test -> repo/fixtures/bench

test('G3 matrix sweep -> fixtures/bench/<device>.csv', async ({ page }) => {
  if (DEVICE === 'unknown') {
    console.warn('[G3] DEVICE not set — writing fixtures/bench/unknown.csv. Re-run with DEVICE=<machine>.');
  }
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  let header = '';
  const rows: string[] = [];

  for (const delegate of DELEGATES) {
    for (const recognizer of RECOGNIZERS) {
      for (const resolution of RESOLUTIONS) {
        const q = new URLSearchParams({
          delegate,
          recognizer,
          resolution,
          frames: String(FRAMES),
          numHands: String(NUM_HANDS),
          device: DEVICE,
        });
        const combo = `${delegate}/${recognizer}/${resolution}`;
        await page.goto(`/?${q.toString()}`);
        await page.waitForFunction(() => window.__benchDone === true, undefined, { timeout: 300_000 });

        const err = await page.evaluate(() => window.__benchError);
        const csv = await page.evaluate(() => window.__benchCsv);
        expect(err, `bench error for ${combo}: ${err ?? ''} | page: ${pageErrors.join(' | ')}`).toBeFalsy();
        expect(typeof csv, `no CSV for ${combo}`).toBe('string');

        const lines = (csv as string).trimEnd().split('\n');
        expect(lines[0], `unexpected CSV header for ${combo}`).toBe(BENCH_COLUMNS.join(','));
        if (!header) header = lines[0]!;
        rows.push(...lines.slice(1));
        console.log(`[G3] ${DEVICE} ${combo} -> ${lines[1] ?? '(empty)'}`);
      }
    }
  }

  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, `${DEVICE}.csv`);
  writeFileSync(outFile, `${[header, ...rows].join('\n')}\n`);
  console.log(`[G3] wrote ${rows.length} rows -> ${outFile}`);
});

declare global {
  interface Window {
    __benchDone?: boolean;
    __benchCsv?: string;
    __benchError?: string;
  }
}
