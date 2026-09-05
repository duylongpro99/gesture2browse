import { browser } from 'wxt/browser';
import { PumpStatSchema, type PumpStat } from '@gesture/protocol';

// Service worker — control plane. For G1 it does the two things the offscreen
// API forces here: it creates the offscreen document (only the SW may call
// chrome.offscreen.createDocument) and it surfaces the fps telemetry, because
// the offscreen document may not touch chrome.storage (.claude/rules). Every
// inbound message is validated with the protocol Zod schema before use
// (.claude/rules/background.md). The fps series is diagnostic, not a secret, so
// chrome.storage.session is allowed (the "never" is secrets in local/sync).

const MAX_SERIES = 600; // ~20 min of 2 s windows; bounds session storage.

async function ensureOffscreen(): Promise<void> {
  if (await browser.offscreen.hasDocument()) return;
  await browser.offscreen.createDocument({
    url: '/offscreen.html',
    reasons: [browser.offscreen.Reason.USER_MEDIA],
    justification: 'Camera frame pump for hand-gesture perception (gate G1).',
  });
}

async function record(stat: PumpStat): Promise<void> {
  const cur = await browser.storage.session.get(['pumpSeries']);
  const series: PumpStat[] = Array.isArray(cur.pumpSeries) ? (cur.pumpSeries as PumpStat[]) : [];
  series.push(stat);
  if (series.length > MAX_SERIES) series.splice(0, series.length - MAX_SERIES);
  await browser.storage.session.set({ pumpLatest: stat, pumpSeries: series });
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: unknown) => {
    if (typeof msg !== 'object' || msg === null) return;
    const type = (msg as { type?: unknown }).type;
    if (type === 'PumpStat') {
      const parsed = PumpStatSchema.safeParse((msg as { stat?: unknown }).stat);
      if (!parsed.success) return;
      void record(parsed.data);
    } else if (type === 'PumpError') {
      // Surface pipeline init/read failures for diagnostics (E2, spike-results).
      void browser.storage.session.set({ pumpError: String((msg as { error?: unknown }).error) });
    }
  });

  void ensureOffscreen();
});
