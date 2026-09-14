// CONTRACT (frozen at plan time, milestone 1D.1). Consumer: 1D.3 (the settings
// screen reads first-run completion — to show status and offer "re-run
// onboarding"). Asserts what a consumer of the first-run record needs from the
// OnboardingState that 1D.1 fixes, through the @gesture/protocol public export:
// a boolean completion the background gate and settings both read, a version so a
// future onboarding can re-trigger without clobbering settings, and an optional
// completion timestamp. Malformed stored blobs are rejected (the page and the SW
// are hostile to their own storage, arch §1). Fails until execute (impl Task 1).
// Execute must NOT edit this file.
import { describe, it, expect } from 'vitest';
import {
  OnboardingStateSchema,
  ONBOARDING_VERSION,
} from '@gesture/protocol';

describe('contract: OnboardingState (1D.3)', () => {
  it('round-trips a completed first-run record', () => {
    const state = {
      completed: true,
      completedAt: 1_726_000_000_000,
      version: ONBOARDING_VERSION,
    };
    const parsed = OnboardingStateSchema.parse(state);
    expect(parsed.completed).toBe(true);
    expect(parsed.version).toBe(ONBOARDING_VERSION);
    expect(parsed.completedAt).toBe(1_726_000_000_000);
  });

  it('allows an incomplete record with no completion timestamp', () => {
    const parsed = OnboardingStateSchema.parse({ completed: false, version: 0 });
    expect(parsed.completed).toBe(false);
    expect(parsed.completedAt).toBeUndefined();
  });

  it('exposes a non-negative integer schema version so re-onboarding can bump it', () => {
    expect(Number.isInteger(ONBOARDING_VERSION)).toBe(true);
    expect(ONBOARDING_VERSION).toBeGreaterThanOrEqual(0);
    expect(() => OnboardingStateSchema.parse({ completed: true, version: -1 })).toThrow();
    expect(() => OnboardingStateSchema.parse({ completed: true, version: 1.5 })).toThrow();
  });

  it('rejects a malformed stored blob', () => {
    expect(() => OnboardingStateSchema.parse({ completed: 'yes', version: 1 })).toThrow();
    expect(() => OnboardingStateSchema.parse({ version: 1 })).toThrow();
    expect(() => OnboardingStateSchema.parse(null)).toThrow();
  });
});
