import { expect, test } from '@playwright/test';
import { BENCH_COLUMNS } from '@gesture/protocol';

// Exit check E3: the bench harness runs headless on the placeholder y4m and
// produces a CSV. This test FAILS if `__benchCsv` is absent/empty — that is the
// "produced CSV" gate, not a detection gate (the placeholder video has no hand).
test('bench harness produces a well-formed CSV headless', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?delegate=wasm&recognizer=handlandmarker&resolution=480p&frames=10&device=ci');
  await page.waitForFunction(() => window.__benchDone === true, undefined, { timeout: 90_000 });

  const csv = await page.evaluate(() => window.__benchCsv);
  const pageError = await page.evaluate(() => window.__benchError);
  expect(pageError, `bench page error: ${pageError ?? ''}; console: ${errors.join(' | ')}`).toBeFalsy();

  expect(typeof csv).toBe('string');
  expect(csv && csv.length).toBeGreaterThan(0);

  const lines = (csv as string).split('\n');
  expect(lines[0]).toBe(BENCH_COLUMNS.join(','));
  expect(lines.length).toBeGreaterThanOrEqual(2);
  expect(lines[1]?.split(',').length).toBe(BENCH_COLUMNS.length);
});
