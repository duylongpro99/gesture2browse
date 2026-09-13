// CONTRACT (frozen at plan time, milestone 1C). Consumer: 2A.
// A11yItem is the interactable id scheme 1C freezes and 2A's a11y snapshot shares,
// so "click element 17" is unambiguous (arch §3.3/§3.5, roadmap §5.1: "a11y
// snapshot shape and id sharing with snapping"). The id is a stable-per-page-load
// NUMBER, the same id the snapping index and PageEvent.hover use; bbox is
// [x,y,w,h] CSS px. FAILS today (no A11yItemSchema). Execute must NOT edit this file.
import { describe, it, expect } from 'vitest';
import { A11yItemSchema } from '@gesture/protocol';

describe('contract: A11yItem id scheme (2A)', () => {
  it('parses a full interactable the agent can name and locate', () => {
    const item = A11yItemSchema.parse({
      id: 17,
      role: 'button',
      name: 'Sign in',
      value: '',
      bbox: [10, 20, 80, 24],
      state: ['focusable'],
    });
    expect(item).toMatchObject({ id: 17, role: 'button', name: 'Sign in' });
    expect(item.bbox).toEqual([10, 20, 80, 24]);
  });

  it('requires a numeric id (the shared "click element N" scheme) and a 4-tuple bbox', () => {
    expect(A11yItemSchema.parse({ id: 3, role: 'link', name: 'Docs', bbox: [0, 0, 40, 12] }).id).toBe(3);
    expect(() => A11yItemSchema.parse({ id: '3', role: 'link', name: 'Docs', bbox: [0, 0, 40, 12] })).toThrow();
    expect(() => A11yItemSchema.parse({ id: 3, role: 'link', name: 'Docs', bbox: [0, 0, 40] })).toThrow();
  });

  it('makes value and state optional (a sparse snapshot is still valid)', () => {
    const item = A11yItemSchema.parse({ id: 1, role: 'checkbox', name: 'Remember me', bbox: [0, 0, 16, 16] });
    expect(item.value).toBeUndefined();
    expect(item.state).toBeUndefined();
  });
});
