import { describe, it, expect } from 'vitest';
import { PageEventSchema } from '@gesture/protocol';

describe('PageEvent 1C additions', () => {
  it('carries hover (id or null) and snapshot (A11yItem[])', () => {
    expect(PageEventSchema.parse({ type: 'hover', id: 17, bbox: [0, 0, 10, 10] })).toMatchObject({ id: 17 });
    expect(PageEventSchema.parse({ type: 'hover', id: null })).toMatchObject({ id: null });
    expect(PageEventSchema.parse({ type: 'snapshot', items: [] })).toMatchObject({ items: [] });
  });
});
