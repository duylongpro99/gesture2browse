import { DEFAULT_PROFILE, ONBOARDING_VERSION } from '@gesture/protocol';
import { describe, expect, it } from 'vitest';
import { profileFromSettings, shouldOpenOnboarding } from '../onboarding-gate';

// Pure background gate/profile helpers — no DOM, no chrome.*, no browser globals.

describe('shouldOpenOnboarding', () => {
  it('opens when no state is stored (fresh install)', () => {
    expect(shouldOpenOnboarding(undefined)).toBe(true);
    expect(shouldOpenOnboarding(null)).toBe(true);
  });

  it('opens when the stored blob is corrupt / wrong shape (page is hostile)', () => {
    expect(shouldOpenOnboarding({ completed: 'yes' })).toBe(true);
    expect(shouldOpenOnboarding('nonsense')).toBe(true);
    expect(shouldOpenOnboarding({ completed: true })).toBe(true); // missing version
  });

  it('opens when onboarding was started but not completed', () => {
    expect(shouldOpenOnboarding({ completed: false, version: ONBOARDING_VERSION })).toBe(true);
  });

  it('opens when completed under an older onboarding version (re-trigger)', () => {
    expect(
      shouldOpenOnboarding({ completed: true, version: ONBOARDING_VERSION - 1 }),
    ).toBe(true);
  });

  it('does not open when completed at the current version', () => {
    expect(
      shouldOpenOnboarding({ completed: true, completedAt: 123, version: ONBOARDING_VERSION }),
    ).toBe(false);
  });
});

describe('profileFromSettings', () => {
  it('returns the stored profile when valid', () => {
    expect(profileFromSettings({ profile: 'standard' })).toBe('standard');
    expect(profileFromSettings({ profile: 'accessibility' })).toBe('accessibility');
    expect(profileFromSettings({ profile: 'presenter' })).toBe('presenter');
  });

  it('falls back to the default profile when absent or invalid', () => {
    expect(profileFromSettings(undefined)).toBe(DEFAULT_PROFILE);
    expect(profileFromSettings(null)).toBe(DEFAULT_PROFILE);
    expect(profileFromSettings({})).toBe(DEFAULT_PROFILE);
    expect(profileFromSettings({ profile: 'bogus' })).toBe(DEFAULT_PROFILE);
    expect(profileFromSettings('nonsense')).toBe(DEFAULT_PROFILE);
  });

  it('ignores extra keys a newer settings screen may add (additive Settings)', () => {
    expect(profileFromSettings({ profile: 'standard', snapRadius: 40 })).toBe('standard');
  });
});
