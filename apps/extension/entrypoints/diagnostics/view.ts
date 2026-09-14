import type {
  FalsePositiveEntry,
  PumpStat,
  StageTimings,
  TransitionLogEntry,
} from '@gesture/protocol';

// Pure formatters for the diagnostics readouts (milestone 1D.5, Task 6). No DOM,
// no chrome.*, no gesture-timing constant: the page owns display only, and the
// numbers come from the storage snapshots the service worker wrote (arch §3.2).
// Kept separate from App.tsx so every readout is unit-testable in isolation.

const nf1 = (n: number): string => n.toFixed(1);

export function formatFps(stat: PumpStat | undefined): string {
  return stat ? `${nf1(stat.fps)} fps` : '— fps';
}

export function formatDropped(stat: PumpStat | undefined): string {
  return stat && stat.dropped !== undefined ? `dropped: ${stat.dropped}` : 'dropped: —';
}

export interface StageRow {
  label: string;
  ms: string;
}

const STAGE_LABELS: ReadonlyArray<readonly [keyof StageTimings, string]> = [
  ['captureMs', 'capture'],
  ['inferMs', 'infer'],
  ['normalizeMs', 'normalize'],
  ['classifyMs', 'classify'],
  ['filterMs', 'filter'],
];

export function stageRows(stages: StageTimings | undefined): StageRow[] {
  if (!stages) return [];
  return STAGE_LABELS.map(([key, label]) => ({ label, ms: `${nf1(stages[key])} ms` }));
}

export function formatTransition(t: TransitionLogEntry): string {
  const intent = t.intent ? ` → ${t.intent.type}` : '';
  return `${t.from} → ${t.to} (${t.event})${intent}`;
}

export function formatFalsePositive(fp: FalsePositiveEntry): string {
  const note = fp.note ? ` — ${fp.note}` : '';
  const landmarks = fp.landmarkWindow ? ` [${fp.landmarkWindow.length} landmark frames]` : '';
  return `@${fp.eventTs} (${fp.frameWindow.length} frames)${landmarks}${note}`;
}
