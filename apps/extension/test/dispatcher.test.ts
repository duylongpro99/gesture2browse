import { describe, it, expect, vi } from 'vitest';
import { PageCommandSchema } from '@gesture/protocol';
import { dispatchIntent } from '../entrypoints/background/dispatcher';

// Unit tests for the Intent -> PageCommand dispatcher (Task 5, 1A vertical
// slice). No chrome.*/browser globals — the target is a plain test double.

describe('dispatchIntent', () => {
  it('maps a Scroll intent to a schema-valid scroll PageCommand posted to the target', () => {
    const target = { postMessage: vi.fn() };
    dispatchIntent({ type: 'Scroll', dy: 42 }, target);

    expect(target.postMessage).toHaveBeenCalledTimes(1);
    expect(target.postMessage).toHaveBeenCalledWith({ type: 'scroll', dy: 42 });
    const command = target.postMessage.mock.calls[0]?.[0];
    expect(PageCommandSchema.safeParse(command).success).toBe(true);
  });

  it('does nothing when there is no content target (no page connected yet)', () => {
    // Must not throw when target is null — dispatch is best-effort.
    expect(() => dispatchIntent({ type: 'Scroll', dy: 10 }, null)).not.toThrow();
  });

  it('produces no PageCommand for Arm (1A has no page-visible effect)', () => {
    const target = { postMessage: vi.fn() };
    dispatchIntent({ type: 'Arm' }, target);
    expect(target.postMessage).not.toHaveBeenCalled();
  });

  it('produces no PageCommand for Pause (1A has no page-visible effect)', () => {
    const target = { postMessage: vi.fn() };
    dispatchIntent({ type: 'Pause' }, target);
    expect(target.postMessage).not.toHaveBeenCalled();
  });
});
