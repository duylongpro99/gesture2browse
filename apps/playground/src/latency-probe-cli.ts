/**
 * Owner's live runner for the 0E agent-latency probe (gate G7). Run with:
 *
 *   LLM_PROVIDER_BASE_URL=https://api.example.com/v1 \
 *   LLM_PROVIDER_KEY=sk-... \
 *   LLM_FAST_MODEL=<fast model id> \
 *   LLM_PLANNER_MODEL=<planner model id> \
 *   pnpm --filter @gesture/playground probe:latency
 *
 * Optional: LLM_PROBE_ITERATIONS (default 10), LLM_PROBE_SNAPSHOT (default 150).
 *
 * It runs the pure harness (`latency-probe.ts`) against the real provider over
 * the global `fetch`, prints p50/p95 first-suggestion latency and a capability
 * table for both models, and a CSV block to paste into `spike-results.md §G7`.
 * The provider secret is read from env, held as `providerKey`, and sent only as
 * a Bearer header (boundary-lint rule 2); it is never written anywhere.
 *
 * Node 24 runs this .ts file directly (no tsx, no build step) — the 0A precedent.
 */
import { env, exit, stdout } from 'node:process';
import {
  latencyToCsv,
  runProbe,
  type ProbeResult,
} from './latency-probe.ts';

interface CliConfig {
  baseUrl: string;
  providerKey: string;
  fastModel: string;
  plannerModel: string;
  iterations: number;
  snapshotItems: number;
}

function requireEnv(name: string): string {
  const value = env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`missing required env var ${name}`);
  }
  return value.trim();
}

function readConfig(): CliConfig {
  return {
    baseUrl: requireEnv('LLM_PROVIDER_BASE_URL').replace(/\/$/, ''),
    providerKey: requireEnv('LLM_PROVIDER_KEY'),
    fastModel: requireEnv('LLM_FAST_MODEL'),
    plannerModel: requireEnv('LLM_PLANNER_MODEL'),
    iterations: Number(env.LLM_PROBE_ITERATIONS ?? '10'),
    snapshotItems: Number(env.LLM_PROBE_SNAPSHOT ?? '150'),
  };
}

function printResult(role: string, r: ProbeResult): void {
  const ms = (n: number) => `${Math.round(n)} ms`;
  stdout.write(
    `\n[${role}] model=${r.model}  iterations=${r.iterations}\n` +
      `  first-suggestion  p50 ${ms(r.firstContentMsP50)}   p95 ${ms(r.firstContentMsP95)}` +
      `   (gate: p50 <= 3000 ms)\n` +
      `  total stream      p50 ${ms(r.totalMsP50)}   p95 ${ms(r.totalMsP95)}\n` +
      `  tool-calling      ${r.toolCalling ? 'Y' : 'N'}\n` +
      `  json_schema       ${r.jsonSchema ? 'Y' : 'N'}\n`,
  );
}

async function main(): Promise<void> {
  const cfg = readConfig();
  stdout.write(
    `Agent latency probe (G7) — endpoint ${cfg.baseUrl}, ${cfg.iterations} iterations, ` +
      `${cfg.snapshotItems}-item snapshot\n`,
  );

  const fast = await runProbe(
    { baseUrl: cfg.baseUrl, providerKey: cfg.providerKey, model: cfg.fastModel, iterations: cfg.iterations, snapshotItems: cfg.snapshotItems },
    globalThis.fetch,
  );
  printResult('fast', fast);

  const planner = await runProbe(
    { baseUrl: cfg.baseUrl, providerKey: cfg.providerKey, model: cfg.plannerModel, iterations: cfg.iterations, snapshotItems: cfg.snapshotItems },
    globalThis.fetch,
  );
  printResult('planner', planner);

  stdout.write('\n--- CSV for spike-results.md §G7 ---\n');
  stdout.write(`${latencyToCsv([fast, planner])}\n`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  stdout.write(`\nlatency probe failed: ${msg}\n`);
  exit(1);
});
