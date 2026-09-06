// Port registry (Task 5, 1A vertical slice): holds the single offscreen port
// and the content ports keyed by tab id, and answers "who do we dispatch a
// PageCommand to right now". Pure/injectable — only the subset of
// chrome.runtime.Port this module needs is required, so it is driveable with a
// plain object in tests (no chrome.*/browser globals).

export interface RegistryPort {
  name: string;
  postMessage(message: unknown): void;
  onDisconnect: { addListener(cb: () => void): void };
  onMessage: { addListener(cb: (message: unknown) => void): void };
  sender?: { tab?: { id?: number } };
}

let monotonicId = -1;
function nextMonotonicId(): number {
  const id = monotonicId;
  monotonicId -= 1;
  return id;
}

export function createPortRegistry() {
  let offscreenPort: RegistryPort | null = null;
  const contentPorts = new Map<number, RegistryPort>();
  let lastContentKey: number | null = null;

  return {
    registerOffscreen(port: RegistryPort): void {
      offscreenPort = port;
      port.onDisconnect.addListener(() => {
        if (offscreenPort === port) offscreenPort = null;
      });
    },

    registerContent(port: RegistryPort): void {
      const key = port.sender?.tab?.id ?? nextMonotonicId();
      contentPorts.set(key, port);
      lastContentKey = key;
      port.onDisconnect.addListener(() => {
        if (contentPorts.get(key) === port) contentPorts.delete(key);
        if (lastContentKey === key) lastContentKey = null;
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
  };
}

export type PortRegistry = ReturnType<typeof createPortRegistry>;
