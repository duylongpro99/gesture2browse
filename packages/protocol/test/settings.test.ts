import { describe, it, expect } from 'vitest';
import {
  ProfileSchema,
  SettingsSchema,
  DEFAULT_PROFILE,
  OnboardingStateSchema,
  ONBOARDING_VERSION,
  OnboardingCompleteSchema,
} from '../src/index.js';

describe('Profile / Settings', () => {
  it('names exactly the three product profiles', () => {
    for (const p of ['accessibility', 'standard', 'presenter'] as const) {
      expect(ProfileSchema.parse(p)).toBe(p);
    }
  });

  it('defaults to Accessibility', () => {
    expect(DEFAULT_PROFILE).toBe('accessibility');
    expect(ProfileSchema.parse(DEFAULT_PROFILE)).toBe('accessibility');
  });

  it('Settings round-trips the chosen profile', () => {
    expect(SettingsSchema.parse({ profile: 'standard' }).profile).toBe('standard');
  });

  it('stays additive: strips unknown keys added by 1D.2/1D.3', () => {
    const parsed = SettingsSchema.parse({ profile: 'accessibility', snapRadiusPx: 40 } as unknown as {
      profile: string;
    });
    expect(parsed).toEqual({ profile: 'accessibility' });
  });

  it('rejects an unknown profile', () => {
    expect(() => ProfileSchema.parse('gamer')).toThrow();
    expect(() => SettingsSchema.parse({ profile: 'gamer' })).toThrow();
    expect(() => SettingsSchema.parse({})).toThrow();
  });
});

describe('OnboardingState', () => {
  it('round-trips a completed record', () => {
    const parsed = OnboardingStateSchema.parse({
      completed: true,
      completedAt: 1_726_000_000_000,
      version: ONBOARDING_VERSION,
    });
    expect(parsed).toEqual({ completed: true, completedAt: 1_726_000_000_000, version: 1 });
  });

  it('allows an incomplete record with no timestamp', () => {
    const parsed = OnboardingStateSchema.parse({ completed: false, version: 0 });
    expect(parsed.completedAt).toBeUndefined();
  });

  it('ONBOARDING_VERSION is a non-negative integer', () => {
    expect(Number.isInteger(ONBOARDING_VERSION)).toBe(true);
    expect(ONBOARDING_VERSION).toBeGreaterThanOrEqual(0);
  });

  it('rejects a non-integer or negative version', () => {
    expect(() => OnboardingStateSchema.parse({ completed: true, version: -1 })).toThrow();
    expect(() => OnboardingStateSchema.parse({ completed: true, version: 1.5 })).toThrow();
  });

  it('rejects a malformed blob', () => {
    expect(() => OnboardingStateSchema.parse({ completed: 'yes', version: 1 })).toThrow();
    expect(() => OnboardingStateSchema.parse({ version: 1 })).toThrow();
    expect(() => OnboardingStateSchema.parse(null)).toThrow();
  });
});

describe('OnboardingComplete', () => {
  it('parses the page→SW envelope', () => {
    expect(OnboardingCompleteSchema.parse({ type: 'onboardingComplete' }).type).toBe('onboardingComplete');
  });

  it('rejects a wrong type tag', () => {
    expect(() => OnboardingCompleteSchema.parse({ type: 'done' })).toThrow();
  });
});
