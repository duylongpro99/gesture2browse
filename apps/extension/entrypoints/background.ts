import { browser } from 'wxt/browser';
import {
  PumpStatSchema,
  CameraGrantStatusSchema,
  GestureFrameSchema,
  PageEventSchema,
  PortName,
  type PumpStat,
  type CameraPermissionState,
  type TransitionLogEntry,
} from '@gesture/protocol';
import { deriveGrant } from './grant-camera/permission';
import { createFrameConsumer } from './background/fsm';
import { type DispatchCtx, type Profile, dispatchIntent } from './background/dispatcher';
import { type Bbox, type DebuggerApi, type PermissionsApi, createCdp } from './background/cdp';
import { type TabsApi, createActions } from './background/actions';
import { relayPointer } from './background/pointer';
import { createPortRegistry, type RegistryPort, type SessionStore } from './background/ports';
import { createReinjector, type NavigationDetails, type ScriptingApi } from './background/reinject';

// Service worker — control plane. It does the three things the offscreen/grant
// APIs force here:
//  - creates the offscreen document (only the SW may call chrome.offscreen.*),
//  - surfaces the fps telemetry (the offscreen doc may not touch chrome.storage),
//  - runs the camera pre-check GATE before every offscreen start (0C / gate G2):
//    query the camera permission and, when it is definitively NOT granted, open
//    the full-tab grant page instead of starting a pump that would only throw
//    NotAllowedError (arch §3.4, 04-feasibility A2).
// Every inbound message and every stored CameraGrantStatus is validated with the
// protocol Zod schema before use (.claude/rules/background.md; arch §7 "page is
// hostile" — even our own grant page's stored blob is validated). Grant state is
// diagnostic, not a secret, so chrome.storage.session/local are allowed (the
// "never" is secrets in local/sync).

const MAX_SERIES = 600; // ~20 min of 2 s windows; bounds session storage.
const SESSION_STATUS_KEY = 'cameraGrantStatus';
const PRECHECK_KEY = 'cameraPrecheck';
const SEEN_KEY = 'cameraGrantSeen';
const TRANSITION_SERIES_KEY = 'transitionSeries';
const TRANSITION_LATEST_KEY = 'transitionLatest';

// Diagnostic-only (arch §3.2 / 1D.5): appends the FSM's per-frame transition
// entries to a bounded chrome.storage.session series, reusing the same
// bounding pattern as `record()` above. Not a secret (.claude/rules/
// background.md) — timing/state labels only.
async function persistTransitions(entries: TransitionLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const cur = await browser.storage.session.get([TRANSITION_SERIES_KEY]);
  const series: TransitionLogEntry[] = Array.isArray(cur[TRANSITION_SERIES_KEY])
    ? (cur[TRANSITION_SERIES_KEY] as TransitionLogEntry[])
    : [];
  series.push(...entries);
  if (series.length > MAX_SERIES) series.splice(0, series.length - MAX_SERIES);
  await browser.storage.session.set({
    [TRANSITION_LATEST_KEY]: entries[entries.length - 1],
    [TRANSITION_SERIES_KEY]: series,
  });
}

async function ensureOffscreen(): Promise<void> {
  if (await browser.offscreen.hasDocument()) return;
  await browser.offscreen.createDocument({
    url: '/offscreen.html',
    reasons: [browser.offscreen.Reason.USER_MEDIA],
    justification: 'Camera frame pump for hand-gesture perception (gate G1).',
  });
}

async function record(stat: PumpStat): Promise<void> {
  const cur = await browser.storage.session.get(['pumpSeries']);
  const series: PumpStat[] = Array.isArray(cur.pumpSeries) ? (cur.pumpSeries as PumpStat[]) : [];
  series.push(stat);
  if (series.length > MAX_SERIES) series.splice(0, series.length - MAX_SERIES);
  await browser.storage.session.set({ pumpLatest: stat, pumpSeries: series });
}

// `camera` is a valid PermissionName in Chrome but absent from the DOM lib union.
type CameraPermissionDescriptor = { name: 'camera' };

/**
 * Ask navigator.permissions for the camera state from inside the service worker.
 * Whether MV3 service workers can answer this is the open question the spike
 * resolves; returns null when it cannot (throws / unsupported), and the gate then
 * falls back to the last CameraGrantStatus the grant page stored.
 */
async function queryCameraState(): Promise<CameraPermissionState | null> {
  try {
    const perms = (globalThis as { navigator?: { permissions?: Permissions } }).navigator?.permissions;
    if (!perms?.query) return null;
    const status = await perms.query({
      name: 'camera',
    } as unknown as CameraPermissionDescriptor as PermissionDescriptor);
    return status.state as CameraPermissionState;
  } catch {
    return null;
  }
}

interface PrecheckResult {
  granted: boolean; // permission is granted → safe to start the offscreen pump
  state: CameraPermissionState | 'unknown';
  queryAnswered: boolean; // did navigator.permissions.query answer in the SW?
  source: 'sw-query' | 'stored-status' | 'indeterminate';
  openedGrantTab: boolean;
}

/**
 * The pre-check gate. Opens the grant page ONLY on a definitive not-granted
 * signal (a successful SW query, or a stored CameraGrantStatus, that is not
 * `granted`). When the state cannot be determined at all — the SW cannot query
 * and nothing is stored yet — it does NOT open a tab and lets the offscreen start
 * proceed (the offscreen getUserMedia is then the real test); blocking on
 * uncertainty would strand a working pump.
 */
async function ensureCameraPermission(): Promise<PrecheckResult> {
  const direct = await queryCameraState();
  let state: CameraPermissionState | 'unknown';
  let source: PrecheckResult['source'];
  let queryAnswered: boolean;

  if (direct !== null) {
    state = direct;
    source = 'sw-query';
    queryAnswered = true;
    // Record the SW's own observation, with cross-session "Allow this time"
    // detection via the shared pure helper.
    const seen = Boolean((await browser.storage.local.get([SEEN_KEY]))[SEEN_KEY]);
    const derived = deriveGrant(direct, seen, 'background-precheck', Date.now());
    await browser.storage.session.set({ [SESSION_STATUS_KEY]: derived.status });
    if (direct === 'granted') await browser.storage.local.set({ [SEEN_KEY]: true });
  } else {
    queryAnswered = false;
    const stored = (await browser.storage.session.get([SESSION_STATUS_KEY]))[SESSION_STATUS_KEY];
    const parsed = CameraGrantStatusSchema.safeParse(stored);
    if (parsed.success) {
      state = parsed.data.state;
      source = 'stored-status';
    } else {
      state = 'unknown';
      source = 'indeterminate';
    }
  }

  const granted = state === 'granted';
  // Definitive not-granted (a known non-granted state) routes to the grant page;
  // 'unknown' does not — proceed and let the offscreen attempt be the test.
  const openGrantTab = !granted && state !== 'unknown';
  if (openGrantTab) {
    await browser.tabs.create({ url: browser.runtime.getURL('/grant-camera.html') });
  }

  const result: PrecheckResult = {
    granted,
    state,
    queryAnswered,
    source,
    openedGrantTab: openGrantTab,
  };
  await browser.storage.session.set({ [PRECHECK_KEY]: result });
  return result;
}

/** Gate, then start the pump unless we routed the user to the grant page. */
async function gateThenPump(): Promise<void> {
  const result = await ensureCameraPermission();
  if (!result.openedGrantTab) await ensureOffscreen();
}

// The real chrome.* APIs the 1C control plane needs, kept behind the injected
// interfaces the pure modules consume (background.ts is the only place that
// touches chrome.*). No @types/chrome in the repo, so read the loosely-typed
// global and cast to those interfaces; the shapes match MV3's promise APIs.
interface ChromeLike {
  debugger?: DebuggerApi;
  permissions?: PermissionsApi;
  tabs?: TabsApi;
  webNavigation?: {
    onCommitted: { addListener(cb: (details: NavigationDetails) => void): void };
  };
  scripting?: ScriptingApi;
}
function chromeApi(): ChromeLike | undefined {
  return (globalThis as { chrome?: ChromeLike }).chrome;
}

// Built content-script bundle path (apps/extension/entrypoints/content/index.ts,
// matches <all_urls>): the manifest-declared entry re-runs on a normal
// full-page navigation on its own; reinject.ts force-injects it only for a tab
// whose content port is not currently live (Task 7).
const CONTENT_SCRIPT_FILES = ['content-scripts/content.js'];

// Mirrors chrome.storage.session behind ports.ts's injectable SessionStore so
// ports.ts never imports wxt/browser itself (.claude/rules/background.md).
const sessionStore: SessionStore = {
  get: (keys) => browser.storage.session.get(keys),
  set: (items) => browser.storage.session.set(items),
};

export default defineBackground(() => {
  const ports = createPortRegistry(sessionStore);

  // Page-side state the FSM/dispatcher read (1A is single-page: one hover, one
  // profile). `dwellEnabled` follows the profile; Standard has no dwell-click.
  // Profile is a getter so 1D can swap in real switching without touching the
  // wiring; Standard is the only 1C profile.
  let lastHover: { id: number | null; bbox?: Bbox } = { id: null };
  const profile = (): Profile => 'standard';

  const cx = chromeApi();
  const cdpImpl = createCdp({
    debugger: cx?.debugger ?? null,
    permissions: cx?.permissions ?? null,
  });
  // Mirror attach/detach onto the port registry's derived CDP-attach flags so
  // they survive a SW restart (Task 7 ruling) — cdp.ts itself stays untouched
  // (its own attached-set is the live source of truth while the worker is up).
  const cdp: Pick<typeof cdpImpl, 'attach' | 'detach' | 'isAttached' | 'preferCdp' | 'trustedClick' | 'trustedDrag'> = {
    ...cdpImpl,
    async attach(tabId) {
      await cdpImpl.attach(tabId);
      ports.setCdpAttached(tabId, cdpImpl.isAttached(tabId));
    },
    async detach(tabId) {
      await cdpImpl.detach(tabId);
      ports.setCdpAttached(tabId, cdpImpl.isAttached(tabId));
    },
  };
  const actions = cx?.tabs ? createActions(cx.tabs) : null;

  const activeTarget = (): { target: RegistryPort | null; tabId: number | null } => {
    const target = ports.currentContentTarget();
    return { target, tabId: target?.sender?.tab?.id ?? null };
  };

  // One reused DispatchCtx so per-gesture state (a CDP drag's start bbox)
  // survives across intents; target/tabId are refreshed before each dispatch.
  const dispatchCtx: DispatchCtx = {
    target: null,
    tabId: null,
    cdp,
    actions: actions ?? { back: async () => {}, forward: async () => {} },
    hover: () => lastHover,
    profile,
  };

  const consumer = createFrameConsumer({
    dispatch: (intent) => {
      const { target, tabId } = activeTarget();
      dispatchCtx.target = target;
      dispatchCtx.tabId = tabId;
      void dispatchIntent(intent, dispatchCtx);
    },
    persist: persistTransitions,
    hover: () => lastHover.id,
    dwellEnabled: () => profile() === 'accessibility',
    relay: (frame, fsmState) => {
      const { target } = activeTarget();
      if (target) relayPointer(frame, fsmState, (c) => target.postMessage(c), { id: lastHover.id });
    },
  });

  browser.runtime.onConnect.addListener((port: RegistryPort) => {
    if (port.name === PortName.OffscreenToServiceWorker) {
      ports.registerOffscreen(port);
      port.onMessage.addListener((message: unknown) => {
        const parsed = GestureFrameSchema.safeParse(message);
        if (!parsed.success) return; // page/offscreen is hostile; ignore malformed frames.
        consumer.push(parsed.data);
      });
    } else if (port.name === PortName.ServiceWorkerToContent) {
      ports.registerContent(port);
      port.onMessage.addListener((message: unknown) => {
        // Inbound PageEvents: `ready` (1A), `hover`/`snapshot` (1C). Validate
        // before acting; the page is hostile. `hover` feeds the FSM + dispatcher;
        // `snapshot` is 2A's a11y consumer (no 1C SW action).
        const parsed = PageEventSchema.safeParse(message);
        if (!parsed.success) return;
        if (parsed.data.type === 'hover') lastHover = { id: parsed.data.id, bbox: parsed.data.bbox };
      });
    }
  });

  browser.runtime.onMessage.addListener((msg: unknown) => {
    if (typeof msg !== 'object' || msg === null) return;
    const type = (msg as { type?: unknown }).type;
    if (type === 'PumpStat') {
      const parsed = PumpStatSchema.safeParse((msg as { stat?: unknown }).stat);
      if (!parsed.success) return;
      void record(parsed.data);
    } else if (type === 'PumpError') {
      // Surface pipeline init/read failures for diagnostics (E2, spike-results).
      void browser.storage.session.set({ pumpError: String((msg as { error?: unknown }).error) });
    } else if (type === 'RunCameraPrecheck') {
      // Re-run the gate on demand (grant e2e / after the grant page reports).
      // If granted, recreate the offscreen so its getUserMedia runs under the
      // now-granted permission and proves the offscreen path (gate assertion c).
      void (async () => {
        const result = await ensureCameraPermission();
        if (result.granted) {
          if (await browser.offscreen.hasDocument()) await browser.offscreen.closeDocument();
          await browser.storage.session.remove(['pumpError']);
          await ensureOffscreen();
        }
      })();
    }
  });

  // Re-inject the content script on a navigation commit for any tab whose
  // content port is not currently live (SPA route change, or any navigation
  // shortly after a SW restart) — Task 7.
  if (cx?.webNavigation && cx.scripting) {
    const reinjector = createReinjector({
      scripting: cx.scripting,
      hasContentPort: (tabId) => ports.hasContentPort(tabId),
      contentScriptFiles: CONTENT_SCRIPT_FILES,
    });
    cx.webNavigation.onCommitted.addListener((details: NavigationDetails) =>
      reinjector.onNavigationCommitted(details),
    );
  }

  // Rehydrate derived state after a worker restart: which tabs had a content
  // port (the reinjector above then re-injects them on their next navigation)
  // and which had CDP attached. Never fabricates live Port objects.
  void ports.restoreState();

  void gateThenPump();
});
