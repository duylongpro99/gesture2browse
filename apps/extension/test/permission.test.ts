import { describe, it, expect } from 'vitest';
import { deriveGrant } from '../entrypoints/grant-camera/permission';

// Unit test for the pure persistence/derivation helper (0C/G2). No browser
// globals: it maps an observed PermissionState plus the cross-session
// `cameraGrantSeen` flag to a CameraGrantStatus and the "Allow this time"
// suspicion. Persistence is only observable across a restart, so the helper is
// what turns two cheap facts (current state, seen-before) into the grant verdict
// the FSM-free gate acts on. Fixture-free; this is the replaceable pure part
// (docs/plans/0C-camera-grant.md §4).

const TS = 1_725_000_000_000;

describe('deriveGrant', () => {
  it('granted + seen before → persistent, not a first grant, no suspicion', () => {
    const d = deriveGrant('granted', true, 'grant-page', TS);
    expect(d.status).toEqual({ ts: TS, state: 'granted', persistent: true, source: 'grant-page' });
    expect(d.allowThisTimeSuspected).toBe(false);
    expect(d.firstGrant).toBe(false);
  });

  it('granted + never seen → first grant, persistent, no suspicion', () => {
    const d = deriveGrant('granted', false, 'grant-page', TS);
    expect(d.status.persistent).toBe(true);
    expect(d.firstGrant).toBe(true);
    expect(d.allowThisTimeSuspected).toBe(false);
  });

  it('prompt + seen a grant before → "Allow this time" suspected, not persistent', () => {
    const d = deriveGrant('prompt', true, 'background-precheck', TS);
    expect(d.status).toEqual({
      ts: TS,
      state: 'prompt',
      persistent: false,
      source: 'background-precheck',
    });
    expect(d.allowThisTimeSuspected).toBe(true);
    expect(d.firstGrant).toBe(false);
  });

  it('denied + seen a grant before → "Allow this time" suspected, not persistent', () => {
    const d = deriveGrant('denied', true, 'background-precheck', TS);
    expect(d.status.persistent).toBe(false);
    expect(d.allowThisTimeSuspected).toBe(true);
  });

  it('prompt + never seen → simply not granted yet, no suspicion', () => {
    const d = deriveGrant('prompt', false, 'grant-page', TS);
    expect(d.status.persistent).toBe(false);
    expect(d.allowThisTimeSuspected).toBe(false);
    expect(d.firstGrant).toBe(false);
  });

  it('produces a record that satisfies the protocol schema shape', () => {
    const d = deriveGrant('granted', false, 'grant-page', TS);
    expect(Object.keys(d.status).sort()).toEqual(['persistent', 'source', 'state', 'ts']);
  });
});
