import { describe, it, expect } from 'vitest';
import { PageCommandSchema } from '@gesture/protocol';

describe('PageCommand 1C additions', () => {
  it('carries a pointer command with x, y and a CursorState', () => {
    expect(PageCommandSchema.parse({ type: 'pointer', x: 0.5, y: 0.2, state: 'snapped' })).toMatchObject({
      type: 'pointer',
      state: 'snapped',
    });
    expect(() => PageCommandSchema.parse({ type: 'pointer', x: 0, y: 0, state: 'wat' })).toThrow();
  });
  it('carries highlight, preview, snapshot and fallbackClick', () => {
    expect(PageCommandSchema.parse({ type: 'highlight', ids: [1, 2] })).toMatchObject({ ids: [1, 2] });
    expect(PageCommandSchema.parse({ type: 'preview', id: 3, label: 'Open' })).toMatchObject({ id: 3 });
    expect(PageCommandSchema.parse({ type: 'snapshot' })).toEqual({ type: 'snapshot' });
    expect(PageCommandSchema.parse({ type: 'fallbackClick', id: 4 })).toMatchObject({ id: 4 });
  });
  it('still parses the 1A scroll command unchanged', () => {
    expect(PageCommandSchema.parse({ type: 'scroll', dy: 120 })).toMatchObject({ type: 'scroll', dy: 120 });
  });
});
