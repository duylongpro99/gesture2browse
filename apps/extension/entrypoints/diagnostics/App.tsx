import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  DiagnosticsConfigSchema,
  FalsePositiveEntrySchema,
  PumpStatSchema,
  TransitionLogEntrySchema,
} from '@gesture/protocol';
import {
  buildDiagnosticsExport,
  DEFAULT_CONFIG,
  type DiagnosticsSnapshot,
  serializeExport,
} from './export.js';
import {
  formatDropped,
  formatFalsePositive,
  formatFps,
  formatTransition,
  stageRows,
} from './view.js';

// Diagnostics page (milestone 1D.5, Task 6). Full-tab entrypoint modeled on
// grant-camera (auto-discovered by WXT). It READS diagnostic snapshots the service
// worker wrote to chrome.storage.session — validating every blob with the protocol
// Zod schemas (the page is hostile to its own storage, arch §1) — and subscribes to
// storage.onChanged for live updates. It never touches raw video: only the numeric
// telemetry, the FSM transition log, and (when armed) landmark POINT counts cross
// into this page. Controls send FlagFalsePositive / SetRecordLandmarks to the SW;
// Export downloads a DiagnosticsExport. No gesture-timing constant lives here
// (single owner is gesture-core) and no confirm() (.claude/rules/diagnostics.md).

const KEYS = ['pumpSeries', 'transitionSeries', 'falsePositiveSeries', 'diagnosticsConfig'] as const;

/** Read + Zod-validate the diagnostics snapshot from storage.session. */
async function readSnapshot(): Promise<DiagnosticsSnapshot> {
  const raw = await browser.storage.session.get([...KEYS]);
  return {
    fps: PumpStatSchema.array().safeParse(raw.pumpSeries).data ?? [],
    transitions: TransitionLogEntrySchema.array().safeParse(raw.transitionSeries).data ?? [],
    falsePositives: FalsePositiveEntrySchema.array().safeParse(raw.falsePositiveSeries).data ?? [],
    config: DiagnosticsConfigSchema.safeParse(raw.diagnosticsConfig).data ?? DEFAULT_CONFIG,
  };
}

export function App() {
  const [snap, setSnap] = useState<DiagnosticsSnapshot>({
    fps: [],
    transitions: [],
    falsePositives: [],
    config: DEFAULT_CONFIG,
  });

  useEffect(() => {
    void readSnapshot().then(setSnap);
    const onChanged = (_c: unknown, area: string) => {
      if (area === 'session') void readSnapshot().then(setSnap);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  const latest = snap.fps.at(-1);

  const flagFalsePositive = useCallback(() => {
    const eventTs = snap.transitions.at(-1)?.ts;
    void browser.runtime.sendMessage({
      type: 'FlagFalsePositive',
      ...(eventTs !== undefined ? { eventTs } : {}),
    });
  }, [snap.transitions]);

  const toggleRecordLandmarks = useCallback(
    (on: boolean) => {
      setSnap((s) => ({ ...s, config: { recordLandmarks: on } }));
      void browser.runtime.sendMessage({ type: 'SetRecordLandmarks', config: { recordLandmarks: on } });
    },
    [],
  );

  const exportJson = useCallback(() => {
    const blob = new Blob([serializeExport(buildDiagnosticsExport(snap, new Date().toISOString()))], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gesture-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [snap]);

  return (
    <main>
      <h1>Gesture diagnostics</h1>

      <section aria-label="pipeline health">
        <p>
          <strong data-testid="fps">{formatFps(latest)}</strong>{' '}
          <span data-testid="dropped">{formatDropped(latest)}</span>
        </p>
        <ul data-testid="stage-timings">
          {stageRows(latest?.stages).map((row) => (
            <li key={row.label} data-testid={`stage-${row.label}`}>
              {row.label}: {row.ms}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="transitions">
        <h2>Transition stream</h2>
        <ol data-testid="transition-stream">
          {snap.transitions.slice(-50).map((t) => (
            <li key={`${t.ts}-${t.from}-${t.to}-${t.event}`}>{formatTransition(t)}</li>
          ))}
        </ol>
      </section>

      <section aria-label="false positives">
        <h2>False positives</h2>
        <button type="button" data-testid="flag-fp" onClick={flagFalsePositive}>
          Flag as false positive
        </button>
        <label>
          <input
            type="checkbox"
            data-testid="record-landmarks"
            checked={snap.config.recordLandmarks}
            onChange={(e) => toggleRecordLandmarks(e.target.checked)}
          />
          Record landmarks
        </label>
        <ul data-testid="false-positive-list">
          {snap.falsePositives.map((fp) => (
            <li key={`${fp.ts}-${fp.eventTs}`}>{formatFalsePositive(fp)}</li>
          ))}
        </ul>
      </section>

      <button type="button" data-testid="export" onClick={exportJson}>
        Export JSON
      </button>
    </main>
  );
}
