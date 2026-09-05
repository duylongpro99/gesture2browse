import type { CameraGrantStatus, CameraPermissionState } from '@gesture/protocol';

// Pure persistence/derivation helper for the camera grant (0C/G2). No browser
// globals, no chrome.* — unit-testable in node (permission.test.ts). It turns an
// observed PermissionState plus the cross-session `cameraGrantSeen` flag into the
// CameraGrantStatus the gate writes, and flags Chrome's "Allow this time" case.
//
// Persistence is only observable across a tab-close / restart: at grant time both
// "Allow on every visit" and "Allow this time" report `granted` with a working
// stream (docs/plans/0C-camera-grant.md §3). So:
//   - state 'granted'  → persistent (it is granted right now, in this session).
//   - state 'prompt'/'denied' while a grant was seen before → the earlier grant
//     was temporary ("Allow this time" reverted) → not persistent, suspected.
//   - state 'prompt'/'denied' with no grant ever seen → simply not granted yet.

export interface GrantDerivation {
  /** The record to persist to chrome.storage.session and read by the gate. */
  status: CameraGrantStatus;
  /** state is not granted but a grant was seen before — a reverted "Allow this time". */
  allowThisTimeSuspected: boolean;
  /** granted for the first time (no prior grant seen) — 1D.1 shows the tutorial. */
  firstGrant: boolean;
}

export function deriveGrant(
  state: CameraPermissionState,
  seen: boolean,
  source: CameraGrantStatus['source'],
  ts: number,
): GrantDerivation {
  const granted = state === 'granted';
  return {
    status: { ts, state, persistent: granted, source },
    allowThisTimeSuspected: !granted && seen,
    firstGrant: granted && !seen,
  };
}
