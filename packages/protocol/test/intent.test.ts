import { describe, it, expect } from 'vitest';
import { IntentSchema } from '@gesture/protocol';

describe('Intent 1C additions', () => {
  it('adds Click/DragStart/DragEnd/Swipe/HoldGesture without touching Arm/Pause/Scroll', () => {
    expect(IntentSchema.parse({ type: 'Click', id: 17 })).toMatchObject({ id: 17 });
    expect(IntentSchema.parse({ type: 'DragStart', id: 3 })).toMatchObject({ id: 3 });
    expect(IntentSchema.parse({ type: 'DragEnd' })).toEqual({ type: 'DragEnd' });
    expect(IntentSchema.parse({ type: 'Swipe', dir: 'left' })).toMatchObject({ dir: 'left' });
    expect(IntentSchema.parse({ type: 'HoldGesture', kind: 'Victory' })).toMatchObject({ kind: 'Victory' });
    expect(() => IntentSchema.parse({ type: 'Swipe', dir: 'up' })).toThrow();
    expect(IntentSchema.parse({ type: 'Scroll', dy: 5 })).toMatchObject({ type: 'Scroll', dy: 5 });
  });
});
