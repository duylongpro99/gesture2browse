import { PageCommandSchema, type PageEvent } from '@gesture/protocol';

// Pure logic for the content script's SW-command execution and
// ready-announcement (Task 3, 1A vertical slice). No `browser`, no DOM
// globals captured here — the runtime port and `window` are wired by
// index.ts, which is not importable under vitest (it calls the
// `defineContentScript` global at module load).

// The top frame's ready announcement. `frameId` is 0 in 1A (top frame only);
// per-frame ids for `all_frames` injection are 1C's concern.
export function readyEvent(frameId: number): PageEvent {
  return { type: 'ready', frameId };
}

// Validate an inbound PageCommand before acting on it — the page is hostile,
// so a malformed or unrecognized message is ignored rather than trusted.
export function applyPageCommand(raw: unknown, win: Pick<Window, 'scrollBy'>): boolean {
  const parsed = PageCommandSchema.safeParse(raw);
  if (!parsed.success) return false;
  const command = parsed.data;
  if (command.type === 'scroll') {
    win.scrollBy({ top: command.dy });
    return true;
  }
  return false;
}
