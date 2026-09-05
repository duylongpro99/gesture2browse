import { describe, expect, it } from 'vitest';
import {
  DISPATCH_COLUMNS,
  outcomesToCsv,
  recommendDefault,
  summarizeOutcomes,
  type DispatchOutcome,
} from '../src/dispatch-survey.js';

function outcome(
  site: string,
  technique: 'synthetic' | 'cdp',
  ok: boolean,
  extra: Partial<DispatchOutcome> = {},
): DispatchOutcome {
  return {
    site,
    category: extra.category ?? 'baseline',
    origin: extra.origin ?? 'same',
    technique,
    reached: extra.reached ?? true,
    ok,
    detail: extra.detail ?? (ok ? 'flag' : 'no-flag'),
  };
}

/** A site surveyed with both techniques. */
function pair(site: string, synthOk: boolean, cdpOk: boolean, extra: Partial<DispatchOutcome> = {}) {
  return [outcome(site, 'synthetic', synthOk, extra), outcome(site, 'cdp', cdpOk, extra)];
}

describe('outcomesToCsv', () => {
  it('header is exactly DISPATCH_COLUMNS.join(",")', () => {
    const csv = outcomesToCsv([]);
    expect(csv).toBe(DISPATCH_COLUMNS.join(','));
  });

  it('emits one row per outcome, cells in column order', () => {
    const csv = outcomesToCsv(pair('button', true, true));
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('site,category,origin,technique,reached,ok,detail');
    expect(lines[1]).toBe('button,baseline,same,synthetic,true,true,flag');
    expect(lines[2]).toBe('button,baseline,same,cdp,true,true,flag');
  });

  it('quotes cells containing commas', () => {
    const csv = outcomesToCsv([outcome('x', 'cdp', false, { detail: 'target not found, gave up' })]);
    expect(csv.split('\n')[1]).toBe('x,baseline,same,cdp,true,false,"target not found, gave up"');
  });
});

describe('summarizeOutcomes', () => {
  it('one verdict row per site, preserving first-seen order', () => {
    const rows = [...pair('b', true, true), ...pair('a', false, true)];
    const summary = summarizeOutcomes(rows);
    expect(summary.map((v) => v.site)).toEqual(['b', 'a']);
  });

  it('maps ok→pass, !ok→fail per technique', () => {
    const summary = summarizeOutcomes(pair('iframe', false, true, { origin: 'cross' }));
    expect(summary[0]).toMatchObject({
      site: 'iframe',
      origin: 'cross',
      synthetic: 'fail',
      cdp: 'pass',
    });
  });

  it('a technique with no outcome row is n/a (technique-unreachable)', () => {
    const summary = summarizeOutcomes([outcome('only-cdp', 'cdp', true)]);
    expect(summary[0]?.synthetic).toBe('n/a');
    expect(summary[0]?.cdp).toBe('pass');
  });
});

describe('recommendDefault', () => {
  it('recommends synthetic when it passes everywhere', () => {
    const rec = recommendDefault([...pair('a', true, true), ...pair('b', true, false)]);
    expect(rec.recommended).toBe('synthetic');
    expect(rec.syntheticPass).toBe(2);
    expect(rec.syntheticFailCdpPass).toBe(0);
  });

  it('recommends cdp when it rescues a synthetic failure', () => {
    const rec = recommendDefault([
      ...pair('easy', true, true),
      ...pair('guard', false, true, { category: 'istrusted-guard' }),
    ]);
    expect(rec.recommended).toBe('cdp');
    expect(rec.syntheticFailCdpPass).toBe(1);
    expect(rec.rationale).toMatch(/CDP recovers 1\/2/);
  });

  it('counts sites that resist both techniques', () => {
    const rec = recommendDefault([
      ...pair('easy', true, true),
      ...pair('select', false, false, { category: 'native-select' }),
    ]);
    expect(rec.bothFail).toBe(1);
    // one synthetic failure, but CDP did not rescue it → synthetic stays the default
    expect(rec.recommended).toBe('synthetic');
  });

  it('totalSites counts distinct sites, not outcome rows', () => {
    const rec = recommendDefault([...pair('a', true, true), ...pair('b', false, true)]);
    expect(rec.totalSites).toBe(2);
  });
});
