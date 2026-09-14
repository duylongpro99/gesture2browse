// CONTRACT (frozen at plan time, milestone 1D.1). Consumers: 1D.2 (calibration
// writes its tunables into the shared Settings record) and 1D.3 (the settings
// screen edits the profile). Asserts what a settings/calibration consumer needs
// from the profile + Settings record that 1D.1 onboarding fixes, through the
// @gesture/protocol public export: the profile vocabulary is exactly the three
// named profiles (arch §3.2 / PRD FR-31), the default is Accessibility (Maya is
// the primary MVP user), Settings carries the chosen profile and stays open to
// additive extension by 1D.2/1D.3, and an unknown profile is rejected. Fails
// until execute (impl Task 1). Execute must NOT edit this file.
import { describe, it, expect } from 'vitest';
import {
  ProfileSchema,
  SettingsSchema,
  DEFAULT_PROFILE,
} from '@gesture/protocol';

describe('contract: Profile + Settings (1D.2, 1D.3)', () => {
  it('names exactly the three product profiles the settings editor offers', () => {
    // 1D.3's profile editor iterates this vocabulary; the names are the arch
    // §3.2 / FR-31 set, no synonyms.
    for (const p of ['accessibility', 'standard', 'presenter'] as const) {
      expect(ProfileSchema.parse(p)).toBe(p);
    }
  });

  it('defaults to the Accessibility profile', () => {
    // Onboarding preselects this and background applies it; 1D.3 restores it on
    // "reset to defaults".
    expect(ProfileSchema.parse(DEFAULT_PROFILE)).toBe('accessibility');
  });

  it('Settings carries the chosen profile', () => {
    const parsed = SettingsSchema.parse({ profile: 'standard' });
    expect(parsed.profile).toBe('standard');
  });

  it('stays additive: unknown extra keys do not break parsing (1D.2/1D.3 extend it)', () => {
    // 1D.2 (calibration tunables) and 1D.3 (camera pick, snap radius, trusted
    // click…) add fields to the same record; a consumer reading only `profile`
    // must still parse a richer Settings written by a newer screen.
    const parsed = SettingsSchema.parse({
      profile: 'accessibility',
      snapRadiusPx: 40,
    } as unknown as { profile: string });
    expect(parsed.profile).toBe('accessibility');
  });

  it('rejects an unknown profile name', () => {
    expect(() => ProfileSchema.parse('gamer')).toThrow();
    expect(() => SettingsSchema.parse({ profile: 'gamer' })).toThrow();
  });
});
