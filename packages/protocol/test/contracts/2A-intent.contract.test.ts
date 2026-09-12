// CONTRACT (frozen at plan time, milestone 1C). Consumer: 2A.
// Asserts what 2A reads from the Intent members 1C adds. The agent plane keys off
// HoldGesture: a Victory hold opens Agent.Proposing, a Thumb_Up hold confirms in
// Agent.AwaitingConfirm, Thumb_Down aborts (arch §4.2/§4.3, roadmap §5.1). Click
// carries the snapped id the dispatcher acts on. 1C adds these additively; 2A only
// consumes them. FAILS today (Intent has only Arm|Pause|Scroll). Execute must NOT
// edit this file.
import { describe, it, expect } from 'vitest';
import { IntentSchema } from '@gesture/protocol';

describe('contract: Intent 1C extensions (2A)', () => {
  it('carries HoldGesture with the four confirm/propose poses', () => {
    for (const kind of ['Victory', 'Thumb_Up', 'Thumb_Down', 'ILoveYou'] as const) {
      expect(IntentSchema.parse({ type: 'HoldGesture', kind })).toMatchObject({ type: 'HoldGesture', kind });
    }
    expect(() => IntentSchema.parse({ type: 'HoldGesture', kind: 'Wink' })).toThrow();
  });

  it('carries Click/DragStart with the snapped interactable id and a bare DragEnd', () => {
    expect(IntentSchema.parse({ type: 'Click', id: 17 })).toMatchObject({ id: 17 });
    expect(IntentSchema.parse({ type: 'DragStart', id: 3 })).toMatchObject({ id: 3 });
    expect(IntentSchema.parse({ type: 'DragEnd' })).toEqual({ type: 'DragEnd' });
    expect(() => IntentSchema.parse({ type: 'Click' })).toThrow();
  });

  it('carries a directional Swipe and does not redefine the frozen 1A members', () => {
    expect(IntentSchema.parse({ type: 'Swipe', dir: 'left' })).toMatchObject({ dir: 'left' });
    expect(() => IntentSchema.parse({ type: 'Swipe', dir: 'up' })).toThrow();
    expect(IntentSchema.parse({ type: 'Arm' })).toEqual({ type: 'Arm' });
    expect(IntentSchema.parse({ type: 'Scroll', dy: 5 })).toMatchObject({ type: 'Scroll', dy: 5 });
  });
});
