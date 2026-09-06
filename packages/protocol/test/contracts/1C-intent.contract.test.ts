// CONTRACT (frozen at plan time, milestone 1A). Consumers: 1B, 1C.
// Asserts what an Intent consumer (1C dispatcher/action mapper; 1B/1C add new
// members) reads from the FROZEN Intent, through the @gesture/protocol public
// export. Intent's schema is already at its final shape (1A only lifts the
// "provisional" marker), so this test is GREEN at plan time and serves as a
// FREEZE GUARD: it locks Arm/Pause/Scroll and the dy=CSS-px contract so no edit
// silently changes them. Execute must NOT edit this file.
import { describe, it, expect } from 'vitest';
import { IntentSchema, type Intent } from '@gesture/protocol';

describe('contract: Intent (1B, 1C)', () => {
  it('is a discriminated union on `type` with Arm, Pause and Scroll', () => {
    expect(IntentSchema.parse({ type: 'Arm' })).toEqual({ type: 'Arm' });
    expect(IntentSchema.parse({ type: 'Pause' })).toEqual({ type: 'Pause' });
    expect(() => IntentSchema.parse({ type: 'NotAnIntent' })).toThrow();
  });

  it('carries Scroll.dy as a signed number the dispatcher reads as CSS pixels', () => {
    const down = IntentSchema.parse({ type: 'Scroll', dy: 120 });
    const up = IntentSchema.parse({ type: 'Scroll', dy: -80 });
    expect(down).toMatchObject({ type: 'Scroll', dy: 120 });
    expect(up).toMatchObject({ type: 'Scroll', dy: -80 });
    // dy is required and numeric — a Scroll without it is not a valid intent.
    expect(() => IntentSchema.parse({ type: 'Scroll' })).toThrow();
    expect(() => IntentSchema.parse({ type: 'Scroll', dy: 'lots' })).toThrow();
  });

  it('narrows by `type` so consumers can switch exhaustively and add members', () => {
    const i: Intent = IntentSchema.parse({ type: 'Scroll', dy: 10 });
    // Type-level: the discriminant is `type`; 1C adds Click/Drag/etc. additively.
    if (i.type === 'Scroll') expect(i.dy).toBeTypeOf('number');
  });
});
