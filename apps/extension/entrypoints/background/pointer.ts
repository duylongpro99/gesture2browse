import type { CursorState, GestureFrame, PageCommand } from '@gesture/protocol';

// Pointer relay (ADR 0001). The direct offscreen→content-script port is
// infeasible in MV3, so the service worker forwards the pointer it already
// receives every frame as a `PageCommand.pointer` over the SW→CS port — one
// message per incoming GestureFrame (i.e. one per animation frame per tab).
// Pure: the SW wires in the send fn and the last hover; no `chrome.*` here.

export interface PointerHover {
  /** Last `PageEvent.hover` id for the target tab (null = over nothing). */
  id: number | null;
}

/** Derive the overlay's CursorState from the FSM state path + hover presence. */
export function cursorStateFor(fsmState: string, hovering: boolean): CursorState {
  if (fsmState.startsWith('Paused')) return 'paused';
  if (fsmState.endsWith('PinchDown')) return 'pinch';
  if (fsmState.endsWith('Dragging')) return 'drag';
  return hovering ? 'snapped' : 'pointing';
}

/**
 * Build and send one `PageCommand.pointer`. Coords are the frame's normalized
 * [0,1] pointer, forwarded verbatim — the content script maps them to CSS px
 * against its live viewport (Task 5). One call per frame is the coalescing point.
 */
export function relayPointer(
  frame: GestureFrame,
  fsmState: string,
  send: (command: PageCommand) => void,
  hover: PointerHover,
): void {
  const state = cursorStateFor(fsmState, hover.id !== null);
  send({ type: 'pointer', x: frame.pointer.x, y: frame.pointer.y, state });
}
