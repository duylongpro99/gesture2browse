// CONTRACT (frozen at plan time, milestone 1C). Consumer: 2A.
// Asserts what the 2A agent plane reads from the PageCommand extensions 1C adds:
// it highlights candidate elements, previews the action it intends, requests the
// a11y snapshot, and (ADR 0001) the pointer plane rides here too. 1C fixes these
// variants additively; 2A adds none, it only consumes them. FAILS today (only the
// 1A `scroll` variant exists). Execute must NOT edit this file.
import { describe, it, expect } from 'vitest';
import { PageCommandSchema } from '@gesture/protocol';

describe('contract: PageCommand 1C extensions (2A)', () => {
  it('requests the a11y snapshot the agent observes the page through', () => {
    expect(PageCommandSchema.parse({ type: 'snapshot' })).toEqual({ type: 'snapshot' });
  });

  it('highlights candidate ids and previews a single labelled action', () => {
    expect(PageCommandSchema.parse({ type: 'highlight', ids: [23, 42] })).toMatchObject({ ids: [23, 42] });
    expect(PageCommandSchema.parse({ type: 'highlight', ids: [1], label: 'Suggestions' })).toMatchObject({
      label: 'Suggestions',
    });
    expect(PageCommandSchema.parse({ type: 'preview', id: 23, label: 'Open Pricing' })).toMatchObject({
      id: 23,
      label: 'Open Pricing',
    });
    // preview requires a label (the preview renders from the action object, arch §4.2)
    expect(() => PageCommandSchema.parse({ type: 'preview', id: 23 })).toThrow();
  });

  it('carries the pointer command (ADR 0001) with a CursorState', () => {
    expect(PageCommandSchema.parse({ type: 'pointer', x: 0.5, y: 0.5, state: 'snapped' })).toMatchObject({
      type: 'pointer',
      state: 'snapped',
    });
    expect(() => PageCommandSchema.parse({ type: 'pointer', x: 0, y: 0, state: 'not-a-state' })).toThrow();
  });

  it('exposes the synthetic fallbackClick by id (the non-CDP path)', () => {
    expect(PageCommandSchema.parse({ type: 'fallbackClick', id: 23 })).toMatchObject({ id: 23 });
  });

  it('does not redefine the frozen 1A scroll command', () => {
    expect(PageCommandSchema.parse({ type: 'scroll', dy: 120 })).toMatchObject({ type: 'scroll', dy: 120 });
    expect(() => PageCommandSchema.parse({ type: 'evalArbitraryJs' })).toThrow();
  });
});
