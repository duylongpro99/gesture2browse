import {
  DEFAULT_PROFILE,
  ONBOARDING_VERSION,
  OnboardingStateSchema,
  SettingsSchema,
  type Profile,
} from '@gesture/protocol';

// Pure background decisions for the 1D.1 first-run flow (spec D4/D5): DOM-free and
// chrome.*-free, so they unit-test in node with no browser globals. background.ts
// owns the I/O (storage reads, tabs.create, onChanged); these helpers only map an
// already-fetched (and possibly hostile) stored blob to a verdict. No gesture-timing
// logic or constant lives here — the SW only *selects* a Profile (single timing owner
// is gesture-core, CLAUDE.md §2). Every blob is re-validated with its protocol Zod
// schema before use (the SW is hostile to its own storage, arch §1).

/**
 * Should the first-run onboarding tab be opened instead of starting the pump?
 * True when the device-local `OnboardingState` is absent, corrupt, not completed,
 * or written by an older onboarding version (a version bump re-triggers the flow
 * without clobbering settings). `raw` is the value read from `chrome.storage.local`.
 */
export function shouldOpenOnboarding(raw: unknown): boolean {
  const parsed = OnboardingStateSchema.safeParse(raw);
  if (!parsed.success) return true;
  return !parsed.data.completed || parsed.data.version < ONBOARDING_VERSION;
}

/**
 * The active `Profile` from a stored `Settings` blob, or `DEFAULT_PROFILE`
 * (Accessibility) when it is absent or invalid. `raw` is the value read from
 * `chrome.storage.sync`; the SW feeds the result to the dispatcher's `profile()`
 * getter and the FSM's dwell toggle.
 */
export function profileFromSettings(raw: unknown): Profile {
  return SettingsSchema.safeParse(raw).data?.profile ?? DEFAULT_PROFILE;
}
