import { browser } from 'wxt/browser';
import { CameraGrantStatusSchema, type CameraPermissionState } from '@gesture/protocol';
import { deriveGrant } from './permission';

// Camera-grant page (0C / gate G2). A full-tab extension page — the only surface
// where getUserMedia can move the chrome-extension origin's camera permission to
// a *persistent* grant that the offscreen document then inherits (the offscreen
// doc and popups cannot prompt; arch §3.4, 04-feasibility A2). It:
//   1. reads the current permission (navigator.permissions.query) as a pre-check,
//   2. calls getUserMedia to trigger the grant, then stops every track at once —
//      this page never renders or retains video (arch §1, .claude/rules/grant-camera.md),
//   3. re-queries, reads the cross-session `cameraGrantSeen` flag, derives the
//      grant verdict (pure helper), writes CameraGrantStatus to storage.session
//      and sets `cameraGrantSeen` in storage.local,
//   4. renders granted / prompt / denied and the "Allow on every visit" guidance,
//      surfacing the "Allow this time" warning when the grant is not persistent.
// It uses no `confirm()` and holds no secrets (boundary-lint, CLAUDE.md §2).

const SESSION_KEY = 'cameraGrantStatus';
const SEEN_KEY = 'cameraGrantSeen';

// `camera` is a valid PermissionName in Chrome but absent from the DOM lib union.
type CameraPermissionDescriptor = { name: 'camera' };

function text(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function queryState(): Promise<CameraPermissionState | null> {
  try {
    const status = await navigator.permissions.query({
      name: 'camera',
    } as unknown as CameraPermissionDescriptor as PermissionDescriptor);
    return status.state as CameraPermissionState;
  } catch {
    return null; // not queryable in this context
  }
}

/** Trigger the grant, then immediately stop every track — no video is kept. */
async function triggerGrant(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    for (const track of stream.getTracks()) track.stop();
    return true;
  } catch {
    return false;
  }
}

async function run(): Promise<void> {
  const pre = await queryState();
  text('precheck', pre ?? 'unknown');

  const acquired = await triggerGrant();

  // Re-query after the grant attempt for the authoritative post-grant state.
  const post = (await queryState()) ?? (acquired ? 'granted' : 'denied');

  const seenBefore = Boolean((await browser.storage.local.get([SEEN_KEY]))[SEEN_KEY]);
  const derived = deriveGrant(post, seenBefore, 'grant-page', Date.now());

  // Persist the observation for the background gate (validated on both sides).
  const status = CameraGrantStatusSchema.parse(derived.status);
  await browser.storage.session.set({ [SESSION_KEY]: status });
  if (post === 'granted') await browser.storage.local.set({ [SEEN_KEY]: true });

  const warn = document.getElementById('allow-this-time-warning');
  if (warn) warn.hidden = !derived.allowThisTimeSuspected;

  if (post === 'granted') {
    text(
      'status',
      derived.firstGrant
        ? 'Camera access granted. You can close this tab; gesture control can start now.'
        : 'Camera access is granted. You can close this tab.',
    );
  } else if (derived.allowThisTimeSuspected) {
    text('status', 'Camera access is no longer granted (a one-visit grant expired).');
  } else if (post === 'denied') {
    text('status', 'Camera access was blocked. Enable the camera for this extension in site settings.');
  } else {
    text('status', 'Camera access was not granted. Reload and choose “Allow on every visit”.');
  }
}

void run().catch((err) => {
  text('status', `Camera grant failed: ${String(err)}`);
});
