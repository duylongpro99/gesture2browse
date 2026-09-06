import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LATENCY_COLUMNS,
  buildSnapshot,
  latencyToCsv,
  p50,
  p95,
  parseSseData,
  percentile,
  runProbe,
  splitSseEvents,
  type ProbeResult,
} from '../src/latency-probe.js';
import { startStub, type StubHandle } from './latency-probe-stub.js';

describe('percentile (nearest-rank)', () => {
  const dist = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100

  it('p50 of 1..100 is 50, p95 is 95', () => {
    expect(percentile(dist, 50)).toBe(50);
    expect(percentile(dist, 95)).toBe(95);
    expect(p50(dist)).toBe(50);
    expect(p95(dist)).toBe(95);
  });

  it('sorts unsorted input before ranking', () => {
    expect(percentile([9, 1, 5, 3, 7], 50)).toBe(5);
  });

  it('a single sample is its own p50 and p95', () => {
    expect(p50([42])).toBe(42);
    expect(p95([42])).toBe(42);
  });
});

describe('splitSseEvents', () => {
  it('splits on the blank-line event boundary and keeps the remainder', () => {
    const { events, rest } = splitSseEvents('data: a\n\ndata: b\n\ndata: par');
    expect(events).toEqual(['data: a', 'data: b']);
    expect(rest).toBe('data: par');
  });

  it('returns no events when no boundary has arrived yet', () => {
    const { events, rest } = splitSseEvents('data: incompl');
    expect(events).toEqual([]);
    expect(rest).toBe('data: incompl');
  });
});

describe('parseSseData', () => {
  it('extracts the JSON payload after `data: `', () => {
    expect(parseSseData('data: {"a":1}')).toBe('{"a":1}');
  });

  it('returns null for the [DONE] sentinel and for comments', () => {
    expect(parseSseData('data: [DONE]')).toBeNull();
    expect(parseSseData(': keep-alive comment')).toBeNull();
  });
});

describe('buildSnapshot', () => {
  it('defaults to a 150-item snapshot with well-formed items', () => {
    const snap = buildSnapshot();
    expect(snap).toHaveLength(150);
    for (const item of snap) {
      expect(typeof item.id).toBe('string');
      expect(typeof item.role).toBe('string');
      expect(typeof item.name).toBe('string');
      expect(item.bbox).toHaveLength(4);
    }
  });

  it('honours an explicit size', () => {
    expect(buildSnapshot(3)).toHaveLength(3);
  });
});

describe('latencyToCsv', () => {
  const result: ProbeResult = {
    model: 'fast-x',
    iterations: 2,
    calls: [],
    firstContentMsP50: 40,
    firstContentMsP95: 55,
    totalMsP50: 90,
    totalMsP95: 110,
    toolCalling: true,
    jsonSchema: true,
  };

  it('header is exactly LATENCY_COLUMNS.join(",")', () => {
    expect(latencyToCsv([]).trim()).toBe(LATENCY_COLUMNS.join(','));
  });

  it('emits one row per result with the model id in the first column', () => {
    const lines = latencyToCsv([result]).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]?.startsWith('fast-x,')).toBe(true);
  });
});

describe('runProbe against the OpenAI-compatible stub', () => {
  let stub: StubHandle;

  beforeAll(async () => {
    stub = await startStub({ firstDelayMs: 20, interChunkMs: 8 });
  });
  afterAll(async () => {
    await stub.close();
  });

  it('measures first-content and total latency, and detects both capabilities', async () => {
    const result = await runProbe(
      { baseUrl: stub.url, providerKey: 'test-key', model: 'stub-model', iterations: 5 },
      globalThis.fetch,
    );

    expect(result.iterations).toBe(5);
    expect(result.calls).toHaveLength(5);
    for (const call of result.calls) {
      // First content arrives after the first delay but before the stream ends.
      expect(call.firstContentMs).toBeGreaterThan(0);
      expect(call.firstContentMs).toBeLessThanOrEqual(call.totalMs);
      expect(call.totalMs).toBeGreaterThan(0);
    }

    expect(Number.isFinite(result.firstContentMsP50)).toBe(true);
    expect(Number.isFinite(result.firstContentMsP95)).toBe(true);
    expect(result.firstContentMsP95).toBeGreaterThanOrEqual(result.firstContentMsP50);

    expect(result.toolCalling).toBe(true);
    expect(result.jsonSchema).toBe(true);
  });
});
