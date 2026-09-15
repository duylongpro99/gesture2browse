import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  CameraGrantStatusSchema,
  OnboardingCompleteSchema,
  OnboardingStateSchema,
  ONBOARDING_VERSION,
  ProfileSchema,
  SettingsSchema,
  type CameraGrantStatus,
  type Profile,
} from '@gesture/protocol';
import {
  cameraPresence,
  cameraStep,
  defaultProfile,
  hostAccessMode,
  nextStep,
  type Step,
} from './steps.js';

// Onboarding page (milestone 1D.1). Full-tab first-run wizard modeled on
// grant-camera/diagnostics (auto-discovered by WXT). App.tsx owns ALL I/O; the
// pure decisions (presence → outcome, camera-status → next step, host-access →
// mode, step ordering, default profile) live in steps.ts and are unit-tested in
// node. This page never calls getUserMedia and renders no video: capture and the
// persistent grant stay in grant-camera (0C); onboarding reads only device *kind*
// (enumerateDevices) and permission *state* (stored CameraGrantStatus /
// permissions.query) and hands the grant off to grant-camera.html. Every stored
// blob is re-validated with its protocol Zod schema before use, and every write is
// Schema.parse-d first (the page is hostile to its own storage, arch §1). No
// gesture-timing constant lives here (single owner is gesture-core, CLAUDE.md §2);
// no confirm(); no network. (.claude/rules/onboarding.md)

const CAMERA_STATUS_KEY = 'cameraGrantStatus'; // storage.session, written by grant-camera / SW
const SETTINGS_KEY = 'settings'; // storage.sync, read by background profile wiring
const ONBOARDING_KEY = 'onboardingState'; // storage.local, read by background gate
const HOST_PATTERN = '<all_urls>';

// sidePanel is a manifest permission (wxt.config.ts) but not on the wxt/browser
// type; read it through a narrow interface rather than `any` (mirrors the
// ChromeLike pattern in background.ts).
interface SidePanelApi {
  open(opts: { windowId?: number; tabId?: number }): Promise<void>;
}
function sidePanelApi(): SidePanelApi | undefined {
  return (browser as unknown as { sidePanel?: SidePanelApi }).sidePanel;
}

/** Read + Zod-validate the stored CameraGrantStatus (null when absent/invalid). */
async function readCameraGrant(): Promise<CameraGrantStatus | null> {
  const raw = (await browser.storage.session.get([CAMERA_STATUS_KEY]))[CAMERA_STATUS_KEY];
  return CameraGrantStatusSchema.safeParse(raw).data ?? null;
}

/** Device *kind* only — is a videoinput present. No getUserMedia, no stream. */
async function readCameraPresence(): Promise<'present' | 'absent'> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return cameraPresence(devices);
  } catch {
    return 'absent';
  }
}

/** Is `<all_urls>` currently granted (host access not withheld)? */
async function readHostAccess(): Promise<boolean> {
  try {
    return await browser.permissions.contains({ origins: [HOST_PATTERN] });
  } catch {
    return false;
  }
}

type ProfileChoice = Extract<Profile, 'accessibility' | 'standard'>;

export function App() {
  const [acknowledgedWelcome, setAcknowledgedWelcome] = useState(false);
  const [camera, setCamera] = useState<'present' | 'absent'>('present');
  const [grant, setGrant] = useState<CameraGrantStatus | null>(null);
  const [hostFull, setHostFull] = useState(true);
  const [acknowledgedSiteAccess, setAcknowledgedSiteAccess] = useState(false);
  const [profileChosen, setProfileChosen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ProfileChoice>(
    defaultProfile() as ProfileChoice,
  );
  const [status, setStatus] = useState('');

  // Refresh the async readouts (mount, Recheck, and grant/host changes).
  const refreshCamera = useCallback(async () => {
    setStatus('Checking for a camera…');
    const [presence, stored] = await Promise.all([readCameraPresence(), readCameraGrant()]);
    setCamera(presence);
    setGrant(stored);
    setStatus('');
  }, []);

  const refreshHost = useCallback(async () => {
    setHostFull(await readHostAccess());
  }, []);

  useEffect(() => {
    void refreshCamera();
    void refreshHost();
    // The grant page writes CameraGrantStatus to storage.session; watch for it so
    // the camera step advances as soon as a persistent grant lands.
    const onChanged = (_changes: unknown, area: string) => {
      if (area === 'session') void readCameraGrant().then(setGrant);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, [refreshCamera, refreshHost]);

  const cameraGrant = cameraStep(grant);
  const hostMode = hostAccessMode(hostFull);
  const step: Step = nextStep({
    acknowledgedWelcome,
    camera,
    cameraGrant,
    acknowledgedSiteAccess,
    profileChosen,
  });

  // Move focus to the active step's heading on advance (keyboard/screen-reader
  // path: the user always lands on the new step's title).
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Re-focus whenever the active step changes (step is read so the dependency is
    // load-bearing: the heading element itself is replaced on each step).
    if (step) headingRef.current?.focus();
  }, [step]);

  const openGrantPage = useCallback(() => {
    setStatus('Waiting for camera access in the other tab…');
    void browser.tabs.create({ url: browser.runtime.getURL('/grant-camera.html') });
  }, []);

  const requestHostAccess = useCallback(async () => {
    setStatus('Requesting access to all sites…');
    try {
      await browser.permissions.request({ origins: [HOST_PATTERN] });
    } catch {
      // Not grantable at runtime — the copy points at the extension's site-access
      // setting; the user can still continue in limited mode.
    }
    await refreshHost();
    setStatus('');
  }, [refreshHost]);

  const chooseProfile = useCallback(async () => {
    const profile = ProfileSchema.parse(selectedProfile);
    const settings = SettingsSchema.parse({ profile });
    await browser.storage.sync.set({ [SETTINGS_KEY]: settings });
    setProfileChosen(true);
  }, [selectedProfile]);

  // On reaching Ready, persist completion once and tell the SW to start the pump.
  const finished = useRef(false);
  useEffect(() => {
    if (step !== 'ready' || finished.current) return;
    finished.current = true;
    void (async () => {
      const state = OnboardingStateSchema.parse({
        completed: true,
        completedAt: Date.now(),
        version: ONBOARDING_VERSION,
      });
      await browser.storage.local.set({ [ONBOARDING_KEY]: state });
      const msg = OnboardingCompleteSchema.parse({ type: 'onboardingComplete' });
      await browser.runtime.sendMessage(msg).catch(() => {});
    })();
  }, [step]);

  const openSidePanel = useCallback(async () => {
    const api = sidePanelApi();
    const tab = await browser.tabs.getCurrent();
    if (api && tab?.windowId !== undefined) await api.open({ windowId: tab.windowId });
  }, []);

  return (
    <main>
      <p data-testid="status" role="status" aria-live="polite">
        {status}
      </p>

      {step === 'welcome' && (
        <section aria-labelledby="welcome-heading" data-testid="step-welcome">
          <h1 id="welcome-heading" tabIndex={-1} ref={headingRef}>
            Point and click with your hand
          </h1>
          <p>
            <strong>Your camera video never leaves this device.</strong> Only
            hand-position landmarks — a handful of points, never the picture — are shared
            between parts of the extension.
          </p>
          <p>
            The extension needs the camera to see where you point, and access to every
            site so it can draw the cursor and click where you point.
          </p>
          <button type="button" data-testid="welcome-continue" onClick={() => setAcknowledgedWelcome(true)}>
            Continue
          </button>
        </section>
      )}

      {step === 'camera' && (
        <section aria-labelledby="camera-heading" data-testid="step-camera">
          <h1 id="camera-heading" tabIndex={-1} ref={headingRef}>
            Camera
          </h1>
          {camera === 'absent' ? (
            <div data-testid="camera-absent">
              <p>No camera detected. Connect one, then choose Recheck.</p>
              <button type="button" data-testid="camera-recheck" onClick={() => void refreshCamera()}>
                Recheck
              </button>
            </div>
          ) : cameraGrant === 'reroute' ? (
            <div data-testid="camera-reroute">
              <p>
                It looks like access was granted for one visit only, or was blocked. Open
                the camera setup again and choose <strong>“Allow on every visit”</strong>.
              </p>
              <button type="button" data-testid="camera-retry" onClick={openGrantPage}>
                Try again
              </button>
            </div>
          ) : (
            <div data-testid="camera-needs-grant">
              <p>
                Set up the camera. On the next tab, choose{' '}
                <strong>“Allow on every visit”</strong> so gesture control can start
                without asking again.
              </p>
              <button type="button" data-testid="camera-setup" onClick={openGrantPage}>
                Set up camera
              </button>
            </div>
          )}
        </section>
      )}

      {step === 'site-access' && (
        <section aria-labelledby="site-heading" data-testid="step-site-access">
          <h1 id="site-heading" tabIndex={-1} ref={headingRef}>
            Site access
          </h1>
          {hostMode === 'full' ? (
            <div data-testid="site-full">
              <p>Ready on every site.</p>
              <button
                type="button"
                data-testid="site-continue"
                onClick={() => setAcknowledgedSiteAccess(true)}
              >
                Continue
              </button>
            </div>
          ) : (
            <div data-testid="site-restricted">
              <p>
                Access is limited. The cursor and clicking will only work on sites you
                allow. Grant access to all sites, or continue in limited mode.
              </p>
              <button type="button" data-testid="site-grant" onClick={() => void requestHostAccess()}>
                Grant access to all sites
              </button>
              <button
                type="button"
                data-testid="site-limited"
                onClick={() => setAcknowledgedSiteAccess(true)}
              >
                Continue in limited mode
              </button>
            </div>
          )}
        </section>
      )}

      {step === 'profile' && (
        <section aria-labelledby="profile-heading" data-testid="step-profile">
          <h1 id="profile-heading" tabIndex={-1} ref={headingRef}>
            Choose a profile
          </h1>
          <fieldset>
            <legend>Profile</legend>
            <label>
              <input
                type="radio"
                name="profile"
                value="accessibility"
                data-testid="profile-accessibility"
                checked={selectedProfile === 'accessibility'}
                onChange={() => setSelectedProfile('accessibility')}
              />
              Accessibility — dwell to click; hands-free control (recommended)
            </label>
            <label>
              <input
                type="radio"
                name="profile"
                value="standard"
                data-testid="profile-standard"
                checked={selectedProfile === 'standard'}
                onChange={() => setSelectedProfile('standard')}
              />
              Standard — pinch to click; swipe to go back and forward
            </label>
          </fieldset>
          <button type="button" data-testid="profile-continue" onClick={() => void chooseProfile()}>
            Continue
          </button>
        </section>
      )}

      {step === 'ready' && (
        <section aria-labelledby="ready-heading" data-testid="step-ready">
          <h1 id="ready-heading" tabIndex={-1} ref={headingRef}>
            You’re ready to point and click
          </h1>
          <p>Gesture control is starting. Point at what you want and use your profile’s click.</p>
          <button type="button" data-testid="ready-calibrate" onClick={() => void openSidePanel()}>
            Calibrate
          </button>
          <button type="button" data-testid="ready-cheatsheet" disabled aria-disabled="true">
            Cheat sheet (coming soon)
          </button>
        </section>
      )}
    </main>
  );
}
