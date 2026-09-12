import type { GestureFrame } from '@gesture/protocol';
import { describe, expect, it, vi } from 'vitest';
import { cursorStateFor, relayPointer } from '../entrypoints/background/pointer';

function frame(x: number, y: number): GestureFrame {
  return {
    ts: 0,
    present: true,
    score: 0.9,
    pinch: 0.5,
    fingers: [false, false, false, false, false],
    velocity: { vx: 0, vy: 0 },
    scale: 1,
    pointer: { x, y },
  };
}

describe('cursorStateFor', () => {
  it('maps FSM states to cursor states', () => {
    expect(cursorStateFor('Paused', false)).toBe('paused');
    expect(cursorStateFor('Armed.PinchDown', true)).toBe('pinch');
    expect(cursorStateFor('Armed.Dragging', true)).toBe('drag');
    expect(cursorStateFor('Armed.Pointing', true)).toBe('snapped');
    expect(cursorStateFor('Armed.Pointing', false)).toBe('pointing');
    expect(cursorStateFor('Armed.Idle', false)).toBe('pointing');
  });
});

describe('relayPointer', () => {
  it('sends a pointer PageCommand with normalized coords and the derived state', () => {
    const send = vi.fn();
    relayPointer(frame(0.25, 0.75), 'Paused', send, { id: null });
    expect(send).toHaveBeenCalledWith({ type: 'pointer', x: 0.25, y: 0.75, state: 'paused' });
  });

  it('reports snapped once a hover id is present', () => {
    const send = vi.fn();
    relayPointer(frame(0.5, 0.5), 'Armed.Pointing', send, { id: 17 });
    expect(send).toHaveBeenCalledWith({ type: 'pointer', x: 0.5, y: 0.5, state: 'snapped' });
  });
});
