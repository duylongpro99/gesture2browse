import { describe, expect, it, vi } from 'vitest';
import { createPortRegistry, type RegistryPort, type SessionStore } from '../entrypoints/background/ports';

// Task 7: SW hardening — reconnect on onDisconnect + rehydrate derived state
// (content-port tab-id set, CDP-attach flags) from an injected fake
// `storage.session` (no chrome.*/browser globals here; see ports.ts header).

function fakePort(tabId: number): { port: RegistryPort; disconnect: () => void } {
  let onDisconnectCb: (() => void) | undefined;
  const port: RegistryPort = {
    name: 'sw->content',
    postMessage: vi.fn(),
    onDisconnect: {
      addListener: (cb) => {
        onDisconnectCb = cb;
      },
    },
    onMessage: { addListener: vi.fn() },
    sender: { tab: { id: tabId } },
  };
  return { port, disconnect: () => onDisconnectCb?.() };
}

function fakeSessionStore(): SessionStore & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys) {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in data) out[k] = data[k];
      return out;
    },
    async set(items) {
      Object.assign(data, items);
    },
  };
}

describe('createPortRegistry reconnect + persistence', () => {
  it('a disconnect followed by re-registering the same tab id restores it as the current target', () => {
    const registry = createPortRegistry();
    const { port: first, disconnect } = fakePort(7);
    registry.registerContent(first);
    expect(registry.currentContentTarget()).toBe(first);

    disconnect();
    expect(registry.currentContentTarget()).toBeNull();

    const { port: second } = fakePort(7);
    registry.registerContent(second);
    expect(registry.currentContentTarget()).toBe(second);
    expect(registry.hasContentPort(7)).toBe(true);
  });

  it('persists the content-tab set on register and drops it on disconnect', async () => {
    const store = fakeSessionStore();
    const registry = createPortRegistry(store);
    const { port, disconnect } = fakePort(9);

    registry.registerContent(port);
    await Promise.resolve(); // let the fire-and-forget persist settle
    expect(store.data.contentTabs).toEqual([9]);

    disconnect();
    await Promise.resolve();
    expect(store.data.contentTabs).toEqual([]);
  });

  it('restoreState rehydrates the derived tab-id set and CDP-attach flags from storage.session', async () => {
    const store = fakeSessionStore();
    store.data.contentTabs = [3, 4];
    store.data.cdpAttached = [4];

    const registry = createPortRegistry(store);
    const restored = await registry.restoreState();

    expect(restored.contentTabs).toEqual([3, 4]);
    expect(restored.cdpAttached).toEqual([4]);
    // Rebuilds derived flags, not live Port objects: no content port exists yet.
    expect(registry.hasContentPort(3)).toBe(false);
    expect(registry.isCdpAttached(4)).toBe(true);
    expect(registry.isCdpAttached(3)).toBe(false);
  });

  it('setCdpAttached toggles the flag and persists it', async () => {
    const store = fakeSessionStore();
    const registry = createPortRegistry(store);

    registry.setCdpAttached(5, true);
    await Promise.resolve();
    expect(store.data.cdpAttached).toEqual([5]);
    expect(registry.isCdpAttached(5)).toBe(true);

    registry.setCdpAttached(5, false);
    await Promise.resolve();
    expect(store.data.cdpAttached).toEqual([]);
    expect(registry.isCdpAttached(5)).toBe(false);
  });
});
