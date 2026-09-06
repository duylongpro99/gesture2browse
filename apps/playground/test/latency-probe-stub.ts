/**
 * A tiny OpenAI-compatible streaming endpoint for the 0E latency probe (gate G7)
 * agent-side test. It is a `node:http` server (test-only, never shipped) that
 * answers `POST {base}/chat/completions` with a canned SSE stream shaped like a
 * real provider: a role delta, several content deltas separated by a measurable
 * inter-chunk delay, a `tool_calls` delta (so the harness can detect
 * tool-calling), a final content that assembles to a `json_schema`-valid
 * proposal (so the harness can detect structured output), then `[DONE]`.
 *
 * Injected into `runProbe` via the real global `fetch` pointed at this server's
 * URL, so the harness is exercised over the wire (SSE framing, chunk
 * boundaries, first-content timing) with no real provider or key.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

export interface StubOptions {
  /** Delay before the first delta is written, ms. Default 20. */
  firstDelayMs?: number;
  /** Delay between successive content deltas, ms. Default 10. */
  interChunkMs?: number;
}

export interface StubHandle {
  /** Base URL, e.g. `http://127.0.0.1:5xxxx/v1`; the harness posts to `${base}/chat/completions`. */
  url: string;
  close: () => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The pieces the content stream spells out; assembled they are a valid proposal. */
const CONTENT_PIECES = ['{"action":', '"click",', '"targetId":', '"e12"}'];

async function writeEvent(res: ServerResponse, payload: unknown): Promise<void> {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function streamCompletion(res: ServerResponse, opts: Required<StubOptions>): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  await sleep(opts.firstDelayMs);
  // Role delta first (no content yet), like real providers.
  await writeEvent(res, { choices: [{ index: 0, delta: { role: 'assistant' } }] });

  // Content deltas that assemble to a schema-valid JSON proposal.
  for (const piece of CONTENT_PIECES) {
    await sleep(opts.interChunkMs);
    await writeEvent(res, { choices: [{ index: 0, delta: { content: piece } }] });
  }

  // A tool_calls delta so the harness detects tool-calling support.
  await sleep(opts.interChunkMs);
  await writeEvent(res, {
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: 'call_0',
              type: 'function',
              function: { name: 'propose_action', arguments: '{"action":"click","targetId":"e12"}' },
            },
          ],
        },
      },
    ],
  });

  await writeEvent(res, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
  res.write('data: [DONE]\n\n');
  res.end();
}

function handler(opts: Required<StubOptions>) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.writeHead(404).end();
      return;
    }
    // Drain the request body, then stream the canned response.
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      void streamCompletion(res, opts).catch(() => res.end());
    });
  };
}

export async function startStub(options: StubOptions = {}): Promise<StubHandle> {
  const opts: Required<StubOptions> = {
    firstDelayMs: options.firstDelayMs ?? 20,
    interChunkMs: options.interChunkMs ?? 10,
  };
  const server: Server = createServer(handler(opts));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}
