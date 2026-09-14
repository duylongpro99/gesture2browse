import type { CameraGrantStatus } from '@gesture/protocol';
import { describe, expect, it } from 'vitest';
import {
  type StepState,
  cameraPresence,
  cameraStep,
  defaultProfile,
  hostAccessMode,
  nextStep,
} from '../steps';

// Pure decision helpers — no DOM, no chrome.*, no browser globals.

const grant = (over: Partial<CameraGrantStatus> = {}): CameraGrantStatus => ({
  ts: 1,
  state: 'granted',
  persistent: true,
  source: 'grant-page',
  ...over,
});

describe('cameraPresence', () => {
  it('present when a videoinput exists', () => {
    expect(cameraPresence([{ kind: 'audioinput' }, { kind: 'videoinput' }])).toBe('present');
  });
  it('absent when no videoinput', () => {
    expect(cameraPresence([{ kind: 'audioinput' }])).toBe('absent');
    expect(cameraPresence([])).toBe('absent');
  });
});

describe('cameraStep', () => {
  it('ok on a persistent grant', () => {
    expect(cameraStep(grant({ state: 'granted', persistent: true }))).toBe('ok');
  });
  it('reroute on a non-persistent "Allow this time" grant', () => {
    expect(cameraStep(grant({ state: 'granted', persistent: false }))).toBe('reroute');
  });
  it('reroute on a denial', () => {
    expect(cameraStep(grant({ state: 'denied', persistent: false }))).toBe('reroute');
  });
  it('needs-grant on a bare prompt', () => {
    expect(cameraStep(grant({ state: 'prompt', persistent: false }))).toBe('needs-grant');
  });
  it('needs-grant with no stored record', () => {
    expect(cameraStep(null)).toBe('needs-grant');
  });
});

describe('hostAccessMode', () => {
  it('full when all-urls granted, restricted otherwise', () => {
    expect(hostAccessMode(true)).toBe('full');
    expect(hostAccessMode(false)).toBe('restricted');
  });
});

describe('nextStep', () => {
  const base: StepState = {
    acknowledgedWelcome: true,
    camera: 'present',
    cameraGrant: 'ok',
    acknowledgedSiteAccess: true,
    profileChosen: true,
  };

  it('parks on welcome until consent acknowledged', () => {
    expect(nextStep({ ...base, acknowledgedWelcome: false })).toBe('welcome');
  });
  it('parks on camera when the camera is absent (dead-end)', () => {
    expect(nextStep({ ...base, camera: 'absent', cameraGrant: 'needs-grant' })).toBe('camera');
  });
  it('parks on camera until the grant is ok', () => {
    expect(nextStep({ ...base, cameraGrant: 'needs-grant' })).toBe('camera');
    expect(nextStep({ ...base, cameraGrant: 'reroute' })).toBe('camera');
  });
  it('advances to site-access once camera is ok', () => {
    expect(nextStep({ ...base, acknowledgedSiteAccess: false })).toBe('site-access');
  });
  it('advances to profile once site access is resolved', () => {
    expect(nextStep({ ...base, profileChosen: false })).toBe('profile');
  });
  it('lands on ready when every step is satisfied', () => {
    expect(nextStep(base)).toBe('ready');
  });
});

describe('defaultProfile', () => {
  it('is Accessibility', () => {
    expect(defaultProfile()).toBe('accessibility');
  });
});
