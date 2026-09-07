import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  DISPATCH_SITES,
  LIVE_SITES,
  type DispatchSite,
  type LiveSite,
} from '../src/dispatch-sites.js';
import {
  DISPATCH_COLUMNS,
  outcomesToCsv,
  recommendDefault,
  summarizeOutcomes,
  type DispatchOutcome,
  type DispatchTechnique,
} from '../src/dispatch-survey.js';
import { cdpClick, readSuccess, syntheticClick, type ClickTarget } from './dispatch-techniques.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(here, '../../../fixtures/dispatch');
const TECHNIQUES: DispatchTechnique[] = ['synthetic', 'cdp'];

/** Serve `fixtures/dispatch/` as static HTML on an ephemeral loopback port. */
function serveFixtures(): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    const name = path === '/' ? 'index.html' : path.slice(1).replace(/[^a-zA-Z0-9._-]/g, '');
    readFile(join(FIXTURES, name))
      .then((buf) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(buf);
      })
      .catch(() => {
        res.statusCode = 404;
        res.end('not found');
      });
  });
  return new Promise((r) =>
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      r({ server, origin: `http://127.0.0.1:${port}` });
    }),
  );
}

function fixtureUrl(site: DispatchSite, originA: string, originB: string): string {
  if (site.origin === 'cross') {
    const child = encodeURIComponent(`${originB}/cross-origin-iframe-child.html`);
    return `${originA}/${site.file}?child=${child}`;
  }
  return `${originA}/${site.file}`;
}

async function surveyOne(
  context: BrowserContext,
  site: DispatchSite,
  technique: DispatchTechnique,
  originA: string,
  originB: string,
): Promise<DispatchOutcome> {
  const page = await context.newPage();
  const popups: Page[] = [];
  page.on('popup', (p) => popups.push(p));
  const base: DispatchOutcome = {
    site: site.name,
    category: site.category,
    origin: site.origin,
    technique,
    reached: false,
    ok: false,
    detail: '',
  };
  try {
    await page.goto(fixtureUrl(site, originA, originB), { waitUntil: 'load' });
    const target: ClickTarget = { selector: site.target, frame: site.frame };
    // Let a same-/cross-origin child render before we read its box or reach in.
    if (site.frame) {
      await page
        .frameLocator(site.frame)
        .locator(site.target)
        .first()
        .waitFor({ state: 'visible', timeout: 4000 })
        .catch(() => {});
    }
    const result =
      technique === 'synthetic'
        ? await syntheticClick(page, target)
        : await cdpClick(page, target);
    await page.waitForTimeout(150);
    const ok =
      site.probe.kind === 'popup' ? popups.length > 0 : await readSuccess(page, site.probe);
    base.reached = result.reached;
    base.ok = ok;
    base.detail = result.reached ? (ok ? site.probe.kind : `no-success:${result.detail}`) : result.detail;
  } catch (err) {
    base.detail = `error:${err instanceof Error ? err.message.split('\n')[0] : String(err)}`;
  } finally {
    for (const p of popups) await p.close().catch(() => {});
    await page.close();
  }
  return base;
}

/** Best-effort success for a live site (owner run): the target focused, or the URL changed. */
async function liveSuccess(page: Page, target: string, urlBefore: string): Promise<boolean> {
  const focused = await page
    .evaluate((sel) => document.activeElement?.matches?.(sel) === true, target)
    .catch(() => false);
  return focused || page.url() !== urlBefore;
}

async function surveyLive(
  context: BrowserContext,
  site: LiveSite,
  technique: DispatchTechnique,
): Promise<DispatchOutcome> {
  const page = await context.newPage();
  const popups: Page[] = [];
  page.on('popup', (p) => popups.push(p));
  const base: DispatchOutcome = {
    site: site.name,
    category: site.category,
    origin: 'same',
    technique,
    reached: false,
    ok: false,
    detail: '',
  };
  try {
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const urlBefore = page.url();
    const target: ClickTarget = { selector: site.target };
    const result =
      technique === 'synthetic'
        ? await syntheticClick(page, target)
        : await cdpClick(page, target);
    await page.waitForTimeout(400);
    const ok = popups.length > 0 || (await liveSuccess(page, site.target, urlBefore));
    base.reached = result.reached;
    base.ok = ok;
    base.detail = result.reached ? (ok ? 'observed' : `no-observable:${result.detail}`) : result.detail;
  } catch (err) {
    base.detail = `error:${err instanceof Error ? err.message.split('\n')[0] : String(err)}`;
  } finally {
    for (const p of popups) await p.close().catch(() => {});
    await page.close();
  }
  return base;
}

function report(outcomes: DispatchOutcome[]): void {
  const csv = outcomesToCsv(outcomes);
  const rec = recommendDefault(outcomes);
  const table = summarizeOutcomes(outcomes)
    .map((v) => `  ${v.site.padEnd(22)} synthetic=${v.synthetic.padEnd(4)} cdp=${v.cdp}`)
    .join('\n');
  // Printed to the Playwright stdout so the agent can copy the numbers into
  // docs/spike-results.md §G5 (the survey is a diagnostic, not an assertion).
  console.log(`\n===== dispatch survey =====\n${table}`);
  console.log(
    `\nrecommended default: ${rec.recommended}` +
      ` (synthetic-pass=${rec.syntheticPass}, cdp-rescues=${rec.syntheticFailCdpPass}, both-fail=${rec.bothFail}, sites=${rec.totalSites})`,
  );
  console.log(`rationale: ${rec.rationale}`);
  console.log(`\n===== dispatch survey CSV =====\n${csv}\n===== end CSV =====\n`);
}

const LIVE = process.env.SURVEY_LIVE === '1';

test('click-dispatch survey: both techniques over every fixture, well-formed rows', async ({
  context,
}) => {
  test.skip(LIVE, 'SURVEY_LIVE=1 runs the live list instead (owner run)');
  test.setTimeout(120_000);

  const a = await serveFixtures();
  const b = await serveFixtures();
  const outcomes: DispatchOutcome[] = [];
  try {
    for (const site of DISPATCH_SITES) {
      for (const technique of TECHNIQUES) {
        outcomes.push(await surveyOne(context, site, technique, a.origin, b.origin));
      }
    }
  } finally {
    a.server.close();
    b.server.close();
  }

  report(outcomes);

  // Coverage/soundness gate (not "synthetic must pass"): every fixture × technique
  // produced a well-formed row, and the CSV round-trips the schema.
  expect(outcomes).toHaveLength(DISPATCH_SITES.length * TECHNIQUES.length);
  for (const o of outcomes) {
    expect(typeof o.ok, `${o.site}/${o.technique} ok`).toBe('boolean');
    expect(o.detail, `${o.site}/${o.technique} detail`).not.toBe('');
  }
  const lines = outcomesToCsv(outcomes).split('\n');
  expect(lines[0]).toBe(DISPATCH_COLUMNS.join(','));
  expect(lines.length).toBe(outcomes.length + 1);
  for (const line of lines.slice(1)) {
    expect(line.split(',').length).toBeGreaterThanOrEqual(DISPATCH_COLUMNS.length);
  }

  // The finding the survey exists to make: at least one hard case where the
  // untrusted synthetic path fails but the trusted CDP path succeeds.
  const rec = recommendDefault(outcomes);
  expect(rec.totalSites).toBe(DISPATCH_SITES.length);
  expect(rec.syntheticFailCdpPass, 'expected CDP to rescue at least one fixture').toBeGreaterThan(0);
});

test('click-dispatch survey: live list (owner run, network)', async ({ context }) => {
  test.skip(!LIVE, 'set SURVEY_LIVE=1 to run the live list');
  test.setTimeout(180_000);

  const outcomes: DispatchOutcome[] = [];
  for (const site of LIVE_SITES) {
    for (const technique of TECHNIQUES) {
      outcomes.push(await surveyLive(context, site, technique));
    }
  }
  report(outcomes);
  expect(outcomes).toHaveLength(LIVE_SITES.length * TECHNIQUES.length);
});
