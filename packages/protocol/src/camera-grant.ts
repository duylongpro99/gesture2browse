import { z } from 'zod';

// CameraGrantStatus — the one message that joins the two 0C/G2 owners: the
// full-tab grant page (apps/extension/entrypoints/grant-camera) and the service
// worker's pre-check gate (background.ts). Whichever side last observed the
// camera permission writes this record to chrome.storage.session; the background
// gate reads it (and 1D.1 onboarding reads it later). Grant-scoped and numeric/
// enum only — no video, no VideoFrame; the raw stream never crosses here
// (02-architecture §1). The background gate validates a stored record with this
// schema before acting on it (.claude/rules/background.md, arch §7 "page is
// hostile" — never trust a raw stored blob, even one our own page wrote).

// The three navigator.permissions PermissionState values, named in the protocol
// so both sides share one vocabulary (protocol depends on `zod` only, so the DOM
// PermissionState type is re-expressed here rather than imported).
export const CameraPermissionStateSchema = z.enum(['granted', 'denied', 'prompt']);
export type CameraPermissionState = z.infer<typeof CameraPermissionStateSchema>;

export const CameraGrantStatusSchema = z.object({
  ts: z.number(), // Date.now() at observation
  state: CameraPermissionStateSchema, // navigator.permissions PermissionState
  persistent: z.boolean(), // true = survives a restart ("Allow on every visit");
  //                          false = "Allow this time" suspected / not persistent
  source: z.enum(['grant-page', 'background-precheck']), // who observed it
});
export type CameraGrantStatus = z.infer<typeof CameraGrantStatusSchema>;
