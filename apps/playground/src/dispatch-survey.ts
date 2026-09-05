/**
 * Pure outcome model for the 0D click-dispatch survey (gate G5). No browser
 * globals, no Playwright — this is the unit-testable core the e2e feeds. It
 * mirrors the 0A `csv.ts` pattern: a fixed column tuple whose `.join(',')` is
 * the CSV header, so a consumer can reuse `DISPATCH_COLUMNS` as the schema.
 *
 * A "dispatch outcome" is one measurement: technique T applied to site S either
 * reached the target and the site's success probe fired (`ok`), or it did not.
 * Two techniques model the extension's two production input paths from outside
 * (plan §1): `synthetic` = the content script's untrusted `dispatchEvent`
 * fallback; `cdp` = the service worker's trusted `chrome.debugger` primary path.
 */

export type DispatchTechnique = 'synthetic' | 'cdp';
export type SiteOrigin = 'same' | 'cross';
export type Verdict = 'pass' | 'fail' | 'n/a';

export interface DispatchOutcome {
  /** Fixture name (or live-site host) surveyed. */
  site: string;
  /** The discriminating mechanism (from the site catalog). */
  category: string;
  /** Whether the target lives in a same- or cross-origin document. */
  origin: SiteOrigin;
  technique: DispatchTechnique;
  /** The technique located the target and dispatched at it. */
  reached: boolean;
  /** The site's success probe fired (the click "worked"). */
  ok: boolean;
  /** Human-readable outcome note (probe kind, or why it failed). */
  detail: string;
}

/** CSV schema for the survey. Header is exactly `DISPATCH_COLUMNS.join(',')`. */
export const DISPATCH_COLUMNS = [
  'site',
  'category',
  'origin',
  'technique',
  'reached',
  'ok',
  'detail',
] as const;

export type DispatchColumn = (typeof DISPATCH_COLUMNS)[number];

/** Serialize outcome rows to CSV, one row per (site × technique). */
export function outcomesToCsv(outcomes: DispatchOutcome[]): string {
  const header = DISPATCH_COLUMNS.join(',');
  const body = outcomes.map((o) =>
    DISPATCH_COLUMNS.map((c) => csvCell((o as unknown as Record<string, unknown>)[c])).join(','),
  );
  return [header, ...body].join('\n');
}

function csvCell(value: unknown): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface SiteVerdict {
  site: string;
  category: string;
  origin: SiteOrigin;
  synthetic: Verdict;
  cdp: Verdict;
}

/**
 * Collapse the flat outcome list to one row per site with a per-technique
 * verdict. A technique with no outcome row is `n/a` (never attempted); one that
 * ran is `pass`/`fail` on its `ok`. Sites keep first-seen order.
 */
export function summarizeOutcomes(outcomes: DispatchOutcome[]): SiteVerdict[] {
  const order: string[] = [];
  const bySite = new Map<string, SiteVerdict>();
  for (const o of outcomes) {
    let v = bySite.get(o.site);
    if (!v) {
      v = { site: o.site, category: o.category, origin: o.origin, synthetic: 'n/a', cdp: 'n/a' };
      bySite.set(o.site, v);
      order.push(o.site);
    }
    v[o.technique] = o.ok ? 'pass' : 'fail';
  }
  return order.map((s) => bySite.get(s) as SiteVerdict);
}

export interface DefaultRecommendation {
  recommended: DispatchTechnique;
  totalSites: number;
  /** Sites where synthetic passed (CDP not required). */
  syntheticPass: number;
  /** Sites where synthetic failed but CDP passed — the trusted path's payoff. */
  syntheticFailCdpPass: number;
  /** Sites where neither technique succeeded (a click cannot drive them). */
  bothFail: number;
  rationale: string;
}

/**
 * Recommend the dispatch default from the survey (plan §4). The page is hostile:
 * if any site is only reachable via the trusted CDP path, an untrusted-synthetic
 * default would silently fail there, so recommend CDP; if synthetic suffices
 * everywhere, prefer it (no `chrome.debugger` banner). The counts let the owner
 * weigh the escalation alternative (synthetic-first, CDP on failure).
 */
export function recommendDefault(outcomes: DispatchOutcome[]): DefaultRecommendation {
  const verdicts = summarizeOutcomes(outcomes);
  let syntheticPass = 0;
  let syntheticFailCdpPass = 0;
  let bothFail = 0;
  for (const v of verdicts) {
    if (v.synthetic === 'pass') syntheticPass++;
    else if (v.cdp === 'pass') syntheticFailCdpPass++;
    else bothFail++;
  }
  const recommended: DispatchTechnique = syntheticFailCdpPass > 0 ? 'cdp' : 'synthetic';
  const rationale =
    recommended === 'cdp'
      ? `CDP recovers ${syntheticFailCdpPass}/${verdicts.length} site(s) where the untrusted synthetic ` +
        `path fails; a synthetic default would silently miss them. ${bothFail} site(s) resist both ` +
        `(click alone cannot drive them). Owner may instead ship synthetic-first with CDP escalation.`
      : `Synthetic clicks succeed on all ${verdicts.length} surveyed site(s); CDP (with its debugger ` +
        `banner) is not required as the default. ${bothFail} site(s) resist both techniques.`;
  return {
    recommended,
    totalSites: verdicts.length,
    syntheticPass,
    syntheticFailCdpPass,
    bothFail,
    rationale,
  };
}
