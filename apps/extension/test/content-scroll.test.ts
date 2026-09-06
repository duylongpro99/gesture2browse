// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { PageEventSchema } from '@gesture/protocol';
import { applyPageCommand, readyEvent } from '../entrypoints/content/scroll';

// Unit tests for the content script's pure logic (Task 3, 1A vertical slice).
// The content script itself calls the `defineContentScript` global at module
// load and cannot be imported under vitest, so the SW-command-application and
// ready-announcement logic lives in this sibling module instead
// (docs/sdd/1A-vertical-slice/task-3-brief.md).

describe('applyPageCommand', () => {
  it('applies a valid scroll PageCommand via window.scrollBy', () => {
    const win = { scrollBy: vi.fn() };
    const handled = applyPageCommand({ type: 'scroll', dy: 42 }, win);
    expect(handled).toBe(true);
    expect(win.scrollBy).toHaveBeenCalledWith({ top: 42 });
  });

  it('ignores a malformed/invalid command (page is hostile)', () => {
    const win = { scrollBy: vi.fn() };
    const handled = applyPageCommand({ type: 'scroll', dy: 'not-a-number' }, win);
    expect(handled).toBe(false);
    expect(win.scrollBy).not.toHaveBeenCalled();
  });

  it('ignores an unknown command type', () => {
    const win = { scrollBy: vi.fn() };
    const handled = applyPageCommand({ type: 'pointer' }, win);
    expect(handled).toBe(false);
    expect(win.scrollBy).not.toHaveBeenCalled();
  });

  it('ignores completely unrelated payloads', () => {
    const win = { scrollBy: vi.fn() };
    const handled = applyPageCommand('not-an-object', win);
    expect(handled).toBe(false);
    expect(win.scrollBy).not.toHaveBeenCalled();
  });
});

describe('readyEvent', () => {
  it('produces a schema-valid ready PageEvent for the top frame', () => {
    const event = readyEvent(0);
    expect(event).toEqual({ type: 'ready', frameId: 0 });
    expect(PageEventSchema.safeParse(event).success).toBe(true);
  });
});
