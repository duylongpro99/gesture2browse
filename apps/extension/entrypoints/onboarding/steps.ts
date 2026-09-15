import { type CameraGrantStatus, type Profile, DEFAULT_PROFILE } from '@gesture/protocol';

// Pure onboarding decisions (spec "Isolation / testability"): DOM-free and
// chrome.*-free, so they unit-test in node with no browser globals. App.tsx owns
// all I/O (storage read/write with Zod validation, tabs, permissions, runtime);
// this file only maps already-typed readouts to the next thing to show. No
// gesture-timing logic or constant lives here (single owner is gesture-core,
// CLAUDE.md §2) — the only "policy" is step ordering.

/** The five linear wizard steps (spec "The flow"), in order. */
export type Step = 'welcome' | 'camera' | 'site-access' | 'profile' | 'ready';

/** Is a camera present at all? `enumerateDevices` reports device *kind* only. */
export function cameraPresence(devices: { kind: string }[]): 'present' | 'absent' {
  return devices.some((d) => d.kind === 'videoinput') ? 'present' : 'absent';
}

/**
 * Map the stored `CameraGrantStatus` to the camera step's outcome:
 * - a persistent grant ("Allow on every visit") → `ok`, advance;
 * - a non-persistent grant ("Allow this time") or a denial → `reroute`, show the
 *   try-again guidance and re-open the grant page;
 * - no record yet, or a bare prompt → `needs-grant`, open the grant page.
 * The observable rule the flow spec (step 2) fixes; no video, only permission state.
 */
export function cameraStep(status: CameraGrantStatus | null): 'ok' | 'needs-grant' | 'reroute' {
  if (!status) return 'needs-grant';
  if (status.state === 'granted') return status.persistent ? 'ok' : 'reroute';
  if (status.state === 'denied') return 'reroute';
  return 'needs-grant'; // 'prompt' — not yet decided
}

/** Host access is full only when `<all_urls>` is already granted. */
export function hostAccessMode(full: boolean): 'full' | 'restricted' {
  return full ? 'full' : 'restricted';
}

/** Inputs the ordering needs; App.tsx assembles these from its I/O readouts. */
export interface StepState {
  /** User clicked Continue on Welcome (consent acknowledged). */
  acknowledgedWelcome: boolean;
  /** `enumerateDevices` result reduced by `cameraPresence`. */
  camera: 'present' | 'absent';
  /** `CameraGrantStatus` reduced by `cameraStep`. */
  cameraGrant: 'ok' | 'needs-grant' | 'reroute';
  /** User resolved the site-access step (granted all sites or chose limited mode). */
  acknowledgedSiteAccess: boolean;
  /** User picked a profile (writes `Settings.profile`). */
  profileChosen: boolean;
}

/**
 * The active step: the first not-yet-satisfied step in Welcome → Camera →
 * SiteAccess → Profile → Ready. An absent camera or an unfinished grant parks on
 * Camera (dead-end / grant handoff); nothing skips ahead of an unmet step.
 */
export function nextStep(state: StepState): Step {
  if (!state.acknowledgedWelcome) return 'welcome';
  if (state.camera === 'absent') return 'camera';
  if (state.cameraGrant !== 'ok') return 'camera';
  if (!state.acknowledgedSiteAccess) return 'site-access';
  if (!state.profileChosen) return 'profile';
  return 'ready';
}

/** The preselected profile (Accessibility). Not a timing value. */
export function defaultProfile(): Profile {
  return DEFAULT_PROFILE;
}
