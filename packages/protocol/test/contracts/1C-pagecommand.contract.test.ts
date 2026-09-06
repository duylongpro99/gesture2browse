// CONTRACT (frozen at plan time, milestone 1A). Consumer: 1C.
// Asserts what the content script (the 1C page plane) reads from PageCommand,
// through the @gesture/protocol public export. 1A fixes the discriminated-union
// shape and the `scroll` variant; 1C ADDS pointer/highlight/preview/snapshot/
// fallbackClick without redefining `scroll`. FAILS today (no PageCommandSchema).
// Execute must NOT edit this file.
import { describe, it, expect } from 'vitest';
import { PageCommandSchema } from '@gesture/protocol';

describe('contract: PageCommand (1C)', () => {
  it('is a discriminated union on `type` carrying the scroll command', () => {
    const cmd = PageCommandSchema.parse({ type: 'scroll', dy: 120 });
    expect(cmd).toMatchObject({ type: 'scroll', dy: 120 });
  });

  it('carries scroll.dy as a signed number of CSS pixels (same unit as Intent.Scroll)', () => {
    expect(PageCommandSchema.parse({ type: 'scroll', dy: -240 })).toMatchObject({
      type: 'scroll',
      dy: -240,
    });
    expect(() => PageCommandSchema.parse({ type: 'scroll' })).toThrow();
    expect(() => PageCommandSchema.parse({ type: 'scroll', dy: 'down' })).toThrow();
  });

  it('rejects an unknown command type (the content script executes only known commands)', () => {
    expect(() => PageCommandSchema.parse({ type: 'evalArbitraryJs' })).toThrow();
  });
});
