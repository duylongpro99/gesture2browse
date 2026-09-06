/**
 * Pure harness for the 0E agent-latency probe (gate G7, `03-tech-stack §5.7`).
 * No browser globals, no `chrome.*`, no network of its own — it takes an
 * injected `fetch`-like, so it runs identically against the `node:http` stub in
 * CI (agent-side verification) and against a real OpenAI-compatible endpoint
 * from the owner's CLI (`latency-probe-cli.ts`, the gate-deciding live run).
 *
 * What it measures per call: time-to-first-suggestion (first content or
 * `tool_calls` delta) and total stream time, then p50/p95 across N iterations;
 * and whether the provider streamed `tool_calls` and returned `json_schema`-valid
 * structured output. These are the numbers G7 gates on and the inputs 2A needs.
 *
 * This is throwaway measurement code. The snapshot and the request/response
 * shapes are local, deliberately NOT the production `A11ySnapshot`/`Proposal` —
 * those are fixed later in milestone 2A (roadmap §5.1). The only shared idiom is
 * the 0A CSV pattern: a fixed column tuple whose `.join(',')` is the header.
 *
 * Secret handling (boundary-lint rule 2 / CLAUDE.md §2): the provider secret is
 * carried in `ProbeConfig.providerKey` and sent as a `Bearer` header only. It is
 * never named `apiKey`/`API_KEY`, never written to disk or `chrome.storage`.
 */

// ── Percentiles (nearest-rank) ────────────────────────────────────────────────

/**
 * Nearest-rank percentile: the smallest sample at or above the p-th rank. For
 * 1..100 this gives p50 = 50 and p95 = 95 — deterministic, no interpolation, so
 * a small N of live samples maps to an actual observed latency.
 */
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(Math.max(rank, 1), sorted.length) - 1;
  return sorted[idx] as number;
}

export const p50 = (samples: number[]): number => percentile(samples, 50);
export const p95 = (samples: number[]): number => percentile(samples, 95);

// ── SSE parsing ───────────────────────────────────────────────────────────────

/**
 * Split a text buffer into complete SSE event blocks on the blank-line boundary,
 * returning the parsed events and the trailing incomplete remainder to carry
 * into the next read. Handles content that crosses chunk boundaries.
 */
export function splitSseEvents(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  const events = parts.map((e) => e.trim()).filter((e) => e.length > 0);
  return { events, rest };
}

/**
 * Extract the JSON payload from one SSE event block's `data:` line. Returns null
 * for the `[DONE]` sentinel, for comment lines (`:` prefix), and for blocks with
 * no `data:` field.
 */
export function parseSseData(eventBlock: string): string | null {
  for (const line of eventBlock.split('\n')) {
    if (line.startsWith('data:')) {
      const payload = line.slice('data:'.length).trim();
      if (payload === '[DONE]' || payload.length === 0) return null;
      return payload;
    }
  }
  return null;
}

// ── Snapshot (throwaway, 2A owns the real shape) ──────────────────────────────

/** A plausible interactable item — sized to the agent snapshot cap for token load. */
export interface SnapshotItem {
  id: string;
  role: string;
  name: string;
  bbox: [number, number, number, number];
}

const SNAPSHOT_ROLES = ['button', 'link', 'textbox', 'checkbox', 'menuitem', 'tab'];

/** Build an N-item snapshot (default 150 = `03-tech-stack §4` agent snapshot cap). */
export function buildSnapshot(n = 150): SnapshotItem[] {
  const items: SnapshotItem[] = [];
  for (let i = 0; i < n; i++) {
    const role = SNAPSHOT_ROLES[i % SNAPSHOT_ROLES.length] as string;
    items.push({
      id: `e${i}`,
      role,
      name: `${role} ${i} — control label for token realism`,
      bbox: [i % 1000, (i * 7) % 800, 80, 24],
    });
  }
  return items;
}

// ── Request shape (local throwaway proposal schema) ───────────────────────────

/** Local, throwaway structured-output schema (NOT the production `Proposal`). */
const PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'targetId'],
  properties: {
    action: { type: 'string', enum: ['click', 'type', 'scroll'] },
    targetId: { type: 'string' },
  },
} as const;

/** True if `text` is JSON matching the required keys of the local proposal schema. */
export function isSchemaValidProposal(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  if (typeof parsed !== 'object' || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;
  return typeof obj.action === 'string' && typeof obj.targetId === 'string';
}

function requestBody(model: string, snapshot: SnapshotItem[]): string {
  return JSON.stringify({
    model,
    stream: true,
    messages: [
      {
        role: 'system',
        content:
          'You are a browser agent. Given the interactable snapshot, propose the single next action.',
      },
      {
        role: 'user',
        content: `Snapshot (${snapshot.length} items):\n${JSON.stringify(snapshot)}\nPropose the next action.`,
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'propose_action',
          description: 'Propose the next browser action for the given snapshot.',
          parameters: PROPOSAL_SCHEMA,
        },
      },
    ],
    tool_choice: 'auto',
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'proposal', strict: true, schema: PROPOSAL_SCHEMA },
    },
    max_tokens: 256,
  });
}

// ── Probe ─────────────────────────────────────────────────────────────────────

export interface ProbeConfig {
  /** e.g. `https://api.example.com/v1`; the probe posts to `${baseUrl}/chat/completions`. */
  baseUrl: string;
  /** Provider secret, sent only as a `Bearer` header. */
  providerKey: string;
  model: string;
  /** How many timed calls to make (default 1). */
  iterations?: number;
  /** Snapshot size for token load (default 150). */
  snapshotItems?: number;
}

/** Minimal `fetch` shape the probe needs — the real global `fetch` satisfies it. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ProbeCall {
  /** ms from request send to the first content/tool_calls delta. */
  firstContentMs: number;
  /** ms from request send to stream end (`[DONE]`). */
  totalMs: number;
  toolCalling: boolean;
  jsonSchema: boolean;
}

export interface ProbeResult {
  model: string;
  iterations: number;
  calls: ProbeCall[];
  firstContentMsP50: number;
  firstContentMsP95: number;
  totalMsP50: number;
  totalMsP95: number;
  /** Any call streamed a `tool_calls` delta. */
  toolCalling: boolean;
  /** Any call's assembled content was `json_schema`-valid. */
  jsonSchema: boolean;
}

function extractDelta(payload: string): { content: string; toolCalls: boolean } {
  try {
    const obj = JSON.parse(payload) as {
      choices?: { delta?: { content?: string; tool_calls?: unknown[] } }[];
    };
    const delta = obj.choices?.[0]?.delta;
    return {
      content: delta?.content ?? '',
      toolCalls: Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0,
    };
  } catch {
    return { content: '', toolCalls: false };
  }
}

/** Run one timed streaming call and return its measurements. */
async function probeOnce(
  config: Required<Pick<ProbeConfig, 'baseUrl' | 'providerKey' | 'model'>>,
  snapshot: SnapshotItem[],
  fetchLike: FetchLike,
): Promise<ProbeCall> {
  const start = performance.now();
  const res = await fetchLike(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.providerKey}`,
      Accept: 'text/event-stream',
    },
    body: requestBody(config.model, snapshot),
  });

  if (!res.ok || !res.body) {
    throw new Error(`probe request failed: HTTP ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let firstContentMs = 0;
  let assembled = '';
  let sawToolCalls = false;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = splitSseEvents(buffer);
    buffer = rest;
    for (const event of events) {
      const payload = parseSseData(event);
      if (payload === null) continue;
      const { content, toolCalls } = extractDelta(payload);
      if (toolCalls) sawToolCalls = true;
      if ((content.length > 0 || toolCalls) && firstContentMs === 0) {
        firstContentMs = performance.now() - start;
      }
      assembled += content;
    }
  }

  return {
    firstContentMs,
    totalMs: performance.now() - start,
    toolCalling: sawToolCalls,
    jsonSchema: isSchemaValidProposal(assembled),
  };
}

/**
 * Run N timed calls against an OpenAI-compatible endpoint and summarise the
 * latencies (p50/p95) and capability flags. `fetchLike` is injected so the same
 * harness runs against the stub (CI) and the live provider (owner CLI).
 */
export async function runProbe(config: ProbeConfig, fetchLike: FetchLike): Promise<ProbeResult> {
  const iterations = config.iterations ?? 1;
  const snapshot = buildSnapshot(config.snapshotItems ?? 150);
  const base = { baseUrl: config.baseUrl, providerKey: config.providerKey, model: config.model };

  const calls: ProbeCall[] = [];
  for (let i = 0; i < iterations; i++) {
    calls.push(await probeOnce(base, snapshot, fetchLike));
  }

  const firstContent = calls.map((c) => c.firstContentMs);
  const total = calls.map((c) => c.totalMs);
  return {
    model: config.model,
    iterations,
    calls,
    firstContentMsP50: p50(firstContent),
    firstContentMsP95: p95(firstContent),
    totalMsP50: p50(total),
    totalMsP95: p95(total),
    toolCalling: calls.some((c) => c.toolCalling),
    jsonSchema: calls.some((c) => c.jsonSchema),
  };
}

// ── CSV (0A idiom: header is exactly LATENCY_COLUMNS.join(',')) ────────────────

export const LATENCY_COLUMNS = [
  'model',
  'iterations',
  'firstContentMsP50',
  'firstContentMsP95',
  'totalMsP50',
  'totalMsP95',
  'toolCalling',
  'jsonSchema',
] as const;

export type LatencyColumn = (typeof LATENCY_COLUMNS)[number];

function csvCell(value: unknown): string {
  const s = typeof value === 'number' ? String(Math.round(value)) : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize probe results to CSV, one row per result; header is the column tuple. */
export function latencyToCsv(results: ProbeResult[]): string {
  const header = LATENCY_COLUMNS.join(',');
  const body = results.map((r) =>
    LATENCY_COLUMNS.map((c) => csvCell((r as unknown as Record<string, unknown>)[c])).join(','),
  );
  return [header, ...body].join('\n');
}
