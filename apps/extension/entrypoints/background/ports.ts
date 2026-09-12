// Port registry (Task 5, 1A vertical slice; hardened Task 7 for SW recovery):
// holds the single offscreen port and the content ports keyed by tab id, and
// answers "who do we dispatch a PageCommand to right now". Pure/injectable —
// only the subset of chrome.runtime.Port this module needs is required, so it
// is driveable with a plain object in tests (no chrome.*/browser globals).
//
// Live chrome.runtime.Port objects cannot be serialized to storage.session, so
// after a service-worker restart the live content-port map always starts
// empty. What CAN survive a restart is the *derived* state: which tab ids had
// a connected content port, and which tabs had chrome.debugger attached. This
// module persists that derived state (via an injected SessionStore — no
// chrome.*/browser import here; background.ts wires the real
// browser.storage.session) so restoreState() can rehydrate it, and
// reinject.ts's live-port predicate + background.ts's CDP re-attach can act on
// it once content re-injects and reconnects.

export interface RegistryPort {
  name: string;
  postMessage(message: unknown): void;
  onDisconnect: { addListener(cb: () => void): void };
  onMessage: { addListener(cb: (message: unknown) => void): void };
  sender?: { tab?: { id?: number } };
}

// Minimal chrome.storage.session-shaped interface so ports.ts stays free of
// chrome.*/browser imports; background.ts supplies the real
// browser.storage.session, tests supply a plain-object fake.
export interface SessionStore {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const noopSessionStore: SessionStore = {
  async get(): Promise<Record<string, unknown>> {
    return {};
  },
  async set(): Promise<void> {},
};

// Bounded, small keys: arrays of tab ids only (arch §7 — session storage is
// diagnostic state, not a secret, but still kept minimal).
const CONTENT_TABS_KEY = 'contentTabs';
const CDP_ATTACHED_KEY = 'cdpAttached';

export interface RestoredState {
  contentTabs: number[];
  cdpAttached: number[];
}

function toIdArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : [];
}

let monotonicId = -1;
function nextMonotonicId(): number {
  const id = monotonicId;
  monotonicId -= 1;
  return id;
}

export function createPortRegistry(sessionStore: SessionStore = noopSessionStore) {
  let offscreenPort: RegistryPort | null = null;
  const contentPorts = new Map<number, RegistryPort>();
  let lastContentKey: number | null = null;
  const cdpAttachedTabs = new Set<number>();

  function persistContentTabs(): void {
    void sessionStore.set({ [CONTENT_TABS_KEY]: Array.from(contentPorts.keys()) });
  }

  function persistCdpAttached(): void {
    void sessionStore.set({ [CDP_ATTACHED_KEY]: Array.from(cdpAttachedTabs) });
  }

  return {
    registerOffscreen(port: RegistryPort): void {
      offscreenPort = port;
      port.onDisconnect.addListener(() => {
        if (offscreenPort === port) offscreenPort = null;
      });
    },

    // Re-registering the same tab id (a reconnect after onDisconnect, e.g. the
    // content script re-injecting) simply overwrites the map entry and becomes
    // the new current target — that is what "reconnect" means here; the SW
    // never fabricates a Port, it only accepts whatever the content script
    // (re-)establishes.
    registerContent(port: RegistryPort): void {
      const key = port.sender?.tab?.id ?? nextMonotonicId();
      contentPorts.set(key, port);
      lastContentKey = key;
      persistContentTabs();
      port.onDisconnect.addListener(() => {
        if (contentPorts.get(key) === port) contentPorts.delete(key);
        if (lastContentKey === key) lastContentKey = null;
        persistContentTabs();
      });
    },

    offscreenTarget(): RegistryPort | null {
      return offscreenPort;
    },

    // 1A is single-page: the most recently registered (and still connected)
    // content port is the dispatch target. Multi-tab targeting is a later
    // milestone's concern.
    currentContentTarget(): RegistryPort | null {
      if (lastContentKey !== null) {
        const port = contentPorts.get(lastContentKey);
        if (port) return port;
      }
      // Fall back to any remaining connected content port.
      const iter = contentPorts.values().next();
      return iter.done ? null : iter.value;
    },

    /** Does this tab currently have a live, connected content port? Feeds
     *  reinject.ts's re-injection predicate. */
    hasContentPort(tabId: number): boolean {
      return contentPorts.has(tabId);
    },

    /** Record/clear a tab's chrome.debugger attach state (cdp.ts owns the
     *  actual attach/detach; background.ts mirrors the result here so it
     *  survives a SW restart as derived state). */
    setCdpAttached(tabId: number, attached: boolean): void {
      if (attached) cdpAttachedTabs.add(tabId);
      else cdpAttachedTabs.delete(tabId);
      persistCdpAttached();
    },

    isCdpAttached(tabId: number): boolean {
      return cdpAttachedTabs.has(tabId);
    },

    /** Rehydrate the *derived* state after a worker restart: which tab ids
     *  had a content port (so background.ts/reinject.ts know which tabs need
     *  re-injection) and which had CDP attached (so a future Arm can
     *  re-attach). Never fabricates live Port objects — those come back only
     *  when content re-injects and reconnects. */
    async restoreState(): Promise<RestoredState> {
      const stored = await sessionStore.get([CONTENT_TABS_KEY, CDP_ATTACHED_KEY]);
      const contentTabs = toIdArray(stored[CONTENT_TABS_KEY]);
      const cdpAttached = toIdArray(stored[CDP_ATTACHED_KEY]);
      cdpAttachedTabs.clear();
      for (const id of cdpAttached) cdpAttachedTabs.add(id);
      return { contentTabs, cdpAttached };
    },
  };
}

export type PortRegistry = ReturnType<typeof createPortRegistry>;
