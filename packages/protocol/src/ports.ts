// Named chrome.runtime port channels shared across extension components.
// OffscreenToContent is RESERVED: live PointerUpdate wiring lands in 1C via a
// SW-brokered MessageChannel (the offscreen document has no chrome.tabs).
export const PortName = {
  OffscreenToServiceWorker: 'offscreen->sw',
  ServiceWorkerToContent: 'sw->content',
  OffscreenToContent: 'offscreen->content',
} as const;
export type PortName = (typeof PortName)[keyof typeof PortName];
