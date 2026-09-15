import { z } from 'zod';

// Onboarding + user-preference shapes fixed by milestone 1D.1 (first-run wizard),
// shared with 1D.2 (calibration writes tunables into the same Settings record)
// and 1D.3 (the settings screen edits the profile and reads first-run state).
// Additive and zod-only; names come from arch §3.2 / PRD FR-31, no synonyms.
// Every consumer re-validates a stored blob with these schemas before use — the
// page and the SW are hostile to their own storage (arch §1 / §7).

// The three product profiles the settings editor offers. Promotes the informal
// background/dispatcher.ts union to a protocol enum. Default is Accessibility:
// Maya (the primary MVP user) lands on dwell-click without touching settings.
export const ProfileSchema = z.enum(['accessibility', 'standard', 'presenter']);
export type Profile = z.infer<typeof ProfileSchema>;

// Shared const the onboarding picker and the background profile wiring both read
// (not a gesture-timing value — single timing owner stays gesture-core, CLAUDE.md §2).
export const DEFAULT_PROFILE: Profile = 'accessibility';

// The minimal user-preference record, in chrome.storage.sync. Kept open to
// additive extension: 1D.2/1D.3 add fields (calibration tunables, camera pick,
// snap radius…), so a consumer reading only `profile` must still parse a richer
// Settings written by a newer screen — the default z.object() strips unknown keys
// rather than rejecting them.
export const SettingsSchema = z.object({
  profile: ProfileSchema,
});
export type Settings = z.infer<typeof SettingsSchema>;

// Device-local first-run record, in chrome.storage.local. `version` lets a future
// onboarding re-trigger without clobbering settings; `completedAt` is optional.
export const OnboardingStateSchema = z.object({
  completed: z.boolean(),
  completedAt: z.number().optional(),
  version: z.number().int().nonnegative(),
});
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

// The current onboarding schema version; bumping it lets a future onboarding
// re-trigger (OnboardingState.version < ONBOARDING_VERSION).
export const ONBOARDING_VERSION = 1;

// Page→SW envelope announcing the user finished onboarding. The SW runs its grant
// gate and starts the pump; validated with this schema on the way in.
export const OnboardingCompleteSchema = z.object({
  type: z.literal('onboardingComplete'),
});
export type OnboardingComplete = z.infer<typeof OnboardingCompleteSchema>;
