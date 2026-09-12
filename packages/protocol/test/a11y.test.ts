import { describe, it, expect } from 'vitest';
import { A11yItemSchema } from '@gesture/protocol';

describe('A11yItem', () => {
  it('parses a full item with the frozen id scheme', () => {
    const item = A11yItemSchema.parse({ id: 17, role: 'button', name: 'Sign in', bbox: [10, 20, 80, 24] });
    expect(item).toMatchObject({ id: 17, role: 'button', name: 'Sign in', bbox: [10, 20, 80, 24] });
  });
  it('requires a numeric id and a 4-tuple bbox', () => {
    expect(() => A11yItemSchema.parse({ id: '17', role: 'button', name: 'x', bbox: [0, 0, 1, 1] })).toThrow();
    expect(() => A11yItemSchema.parse({ id: 1, role: 'button', name: 'x', bbox: [0, 0, 1] })).toThrow();
  });
});
