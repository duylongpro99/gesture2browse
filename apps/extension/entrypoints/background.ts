import { browser } from 'wxt/browser';
import {
  PumpStatSchema,
  CameraGrantStatusSchema,
  type PumpStat,
  type CameraPermissionState,
} from '@gesture/protocol';
import { deriveGrant } from './grant-camera/permission';

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

export default defineBackground(() => {
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

  void gateThenPump();
});
