// CONTRACT (frozen at plan time, milestone 1C). Consumer: 2A.
// Asserts what the 2A agent plane reads from the PageEvent extensions 1C adds:
// the `snapshot` response carries the A11yItem[] the agent observes, and `hover`
// reports the currently snapped interactable. 1C fixes these additively; 2A only
// consumes them. FAILS today (only the 1A `ready` event exists). Execute must NOT
// edit this file.
import { describe, it, expect } from 'vitest';
import { PageEventSchema } from '@gesture/protocol';

describe('contract: PageEvent 1C extensions (2A)', () => {
  it('carries the snapshot response as an A11yItem[] the agent observes', () => {
    const evt = PageEventSchema.parse({
      type: 'snapshot',
      items: [{ id: 23, role: 'button', name: 'Open Pricing', bbox: [10, 20, 80, 24] }],
    });
    expect(evt).toMatchObject({ type: 'snapshot' });
    if (evt.type === 'snapshot') expect(evt.items[0].id).toBe(23);
  });

  it('reports the snapped interactable (id or null) with an optional bbox', () => {
    expect(PageEventSchema.parse({ type: 'hover', id: 23, bbox: [10, 20, 80, 24] })).toMatchObject({ id: 23 });
    expect(PageEventSchema.parse({ type: 'hover', id: null })).toMatchObject({ id: null });
  });

  it('does not redefine the frozen 1A ready event', () => {
    expect(PageEventSchema.parse({ type: 'ready', frameId: 0 })).toMatchObject({ type: 'ready', frameId: 0 });
    expect(() => PageEventSchema.parse({ type: 'exfiltrate' })).toThrow();
  });
});
