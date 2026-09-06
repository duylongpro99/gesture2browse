// CONTRACT (frozen at plan time, milestone 1A). Consumer: 1C.
// Asserts what the service worker reads from a PageEvent sent by the content
// script, through the @gesture/protocol public export. 1A fixes the shape and
// the `ready` event (the content script announces it is alive + its frameId
// before the SW dispatches a PageCommand to it); 1C ADDS hover/snapshot without
// redefining `ready`. FAILS today (no PageEventSchema). Execute must NOT edit.
import { describe, it, expect } from 'vitest';
import { PageEventSchema } from '@gesture/protocol';

describe('contract: PageEvent (1C)', () => {
  it('is a discriminated union on `type` carrying the ready event with a frameId', () => {
    const evt = PageEventSchema.parse({ type: 'ready', frameId: 0 });
    expect(evt).toMatchObject({ type: 'ready', frameId: 0 });
  });

  it('requires frameId to be numeric (the SW keys the content-script port by it)', () => {
    expect(PageEventSchema.parse({ type: 'ready', frameId: 42 })).toMatchObject({ frameId: 42 });
    expect(() => PageEventSchema.parse({ type: 'ready' })).toThrow();
    expect(() => PageEventSchema.parse({ type: 'ready', frameId: 'main' })).toThrow();
  });

  it('rejects an unknown event type (the SW validates every inbound page message)', () => {
    expect(() => PageEventSchema.parse({ type: 'exfiltrate' })).toThrow();
  });
});
