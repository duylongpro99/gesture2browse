import {
  type DiagnosticsConfig,
  type DiagnosticsExport,
  DiagnosticsExportSchema,
  type FalsePositiveEntry,
  type PumpStat,
  type TransitionLogEntry,
} from '@gesture/protocol';

// Pure builder: a diagnostics storage snapshot -> a DiagnosticsExport blob the
// page downloads and 1E replays against fixtures via gesture-core (milestone
// 1D.5, Task 6). No DOM, no chrome.*; the App reads + Zod-validates storage, then
// hands the typed arrays here. The result is re-validated with the protocol schema
// so a malformed download can never leave the page (the page is hostile to its own
// stored blobs — arch §1 / .claude/rules/diagnostics.md).

/** Diagnostics state read from chrome.storage.session (already Zod-validated). */
export interface DiagnosticsSnapshot {
  fps: PumpStat[];
  transitions: TransitionLogEntry[];
  falsePositives: FalsePositiveEntry[];
  config: DiagnosticsConfig;
}

/** The record-landmarks default (Q3=C) when no config has been persisted yet. */
export const DEFAULT_CONFIG: DiagnosticsConfig = { recordLandmarks: false };

export function buildDiagnosticsExport(
  snapshot: DiagnosticsSnapshot,
  exportedAt: string,
): DiagnosticsExport {
  return DiagnosticsExportSchema.parse({
    schema: 'gesture-diagnostics/v0',
    exportedAt,
    fps: snapshot.fps,
    transitions: snapshot.transitions,
    falsePositives: snapshot.falsePositives,
    config: snapshot.config,
  });
}

/** Pretty-printed JSON for the download. */
export function serializeExport(exp: DiagnosticsExport): string {
  return JSON.stringify(exp, null, 2);
}
