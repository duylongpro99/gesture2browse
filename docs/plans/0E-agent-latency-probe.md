# 0E — Agent latency probe (gate G7) — Plan

**Milestone:** 0E (`docs/05-roadmap.md §3.2`) · **Branch:** `0E` · **Base:** `master` · **Date:** 2026-09-06

Independent Phase-0 spike with its own short plan (roadmap §3.2). It measures **first-suggestion latency** (and the two capability flags the agent loop depends on) against an OpenAI-compatible endpoint, so the go/no-go for G7 and the provider/model-id decision for 2A rest on numbers, not guesses. It is throwaway measurement code: it does **not** build `packages/agent-core` and does **not** fix any production interface — `Proposal`, `Action`, the tool schemas and the `Agent.*` FSM states are fixed later, in milestone 2A (roadmap §5.1). The probe shares nothing with the other gates except the harness-app home and the CSV-emitter shape from 0A.

Architectural plan in the five-question form (`docs/plans/README.md`).

## 1. Placement

**`apps/playground`** owns the probe — the camera-free harness/probe app, the exact sibling of the 0D click-dispatch survey (which put its pure model in `apps/playground/src/` and its runner alongside). One owner, no new package. The probe is a network measurement, not extension runtime code, so it lives in the harness app and never in `apps/extension`.

Runtime: a **Node CLI** (Node 24 built-in TypeScript execution — the 0A precedent for `scripts/fixtures/*`; no `tsx`, no new dependency), driven by global `fetch` + `ReadableStream` SSE parsing. Production `agent-core` (2A) will run the same WHATWG `fetch`/streaming API in the service worker; the gate is time-to-first-suggestion, dominated by network RTT + provider prefill, none of it runtime-specific. Fidelity caveat recorded like 0D's "Playwright CDP, not `chrome.debugger`": this is Node `fetch`, not the service-worker `fetch`; the SSE wire format and streaming API are identical, and browser CORS preflight (which an extension with host permission skips) is not a p50/p95 factor.

The probe splits, exactly as 0D did (E3 agent-side / E1 owner-live):
- **pure harness** (`latency-probe.ts`): SSE chunk parser, per-call first-content-latency timing, p50/p95, capability detection, 150-item snapshot builder, `LATENCY_COLUMNS` CSV. No browser globals, no network — takes an injected `fetch`-like, so it is unit-testable against a stub.
- **CLI** (`latency-probe-cli.ts`): the owner's live runner. Reads endpoint, key and the two model ids from env, runs N iterations against the real provider, prints p50/p95 + a capability table + a CSV block to paste into `spike-results.md §G7`.

## 2. Boundary check

`apps/playground` has no `.claude/rules/*.md`; repo-wide `CLAUDE.md §2` + `scripts/lint/boundary-lint.mjs` govern.

- **Imports / APIs:** `node:http` (stub server, in `test/` only), global `fetch`/`ReadableStream`/`TextDecoder`, `node:process` env. No `chrome.*`, no DOM, no `@mediapipe/*`. ✓ within playground's existing surface (it already makes live network calls under `SURVEY_LIVE`).
- **Secret isolation (boundary-lint rule 2).** The provider key is read from **`process.env.LLM_PROVIDER_KEY`** and held in a variable named `providerKey` / sent as a `Bearer` header — never the identifiers `apiKey` / `API_KEY` / `ANTHROPIC_API_KEY`, which the lint forbids outside `background.ts`. The key is a runtime env value in the owner's shell: never written to disk, never `chrome.storage`, never committed. This satisfies `CLAUDE.md §2` "no secrets in the content script or storage" (the probe touches neither). ✓
- **No `confirm()`** (rule 3): none. ✓ · **No `VideoFrame`/`ImageBitmap`** (rule 1): none. ✓ · **No gesture-timing constant** (rule 4): none. ✓ · **Not a content script** (rule 5): n/a. ✓
- Packages consumed only via `package.json` `exports`; the probe imports nothing from `@gesture/*` (its snapshot/output shapes are local throwaway probe types, not `protocol`). ✓

## 3. Interfaces touched

**None in `packages/protocol`.** The probe does not add or change `GestureFrame`, `Intent`, `PageCommand`, `PageEvent`, `Proposal`, `Action`, or any tool schema. The 150-item snapshot and the streamed structured-output shape are **local, throwaway** types inside `latency-probe.ts` — a plausible interactable/a11y list sized to the `Agent snapshot cap` (150, `03-tech-stack §4`) so the token load is realistic, not the production `A11ySnapshot`/`Proposal` shape. Those are fixed in 2A (roadmap §5.1, "Interfaces fixed here"); re-using or freezing them here would pre-empt that milestone. The only reused shape is the 0A CSV idiom (a fixed `LATENCY_COLUMNS` tuple whose `.join(',')` is the header), kept local to playground like 0D's `DISPATCH_COLUMNS`.

## 4. Principle check (`02-architecture §1`)

- **Two loops, two speeds** — the probe measures only the *slow* agent loop (network, on demand); it never touches the 30 fps perception loop. Establishing the agent-loop latency budget in isolation is exactly this principle. ✓
- **Replaceable parts** — the harness takes an injected `fetch`-like and a provider config (baseURL, key, model ids), so any OpenAI-compatible endpoint is a config change, not a code change (`03-tech-stack §1` provider-agnostic stance); the stub server is one such injected backend. ✓
- **Video stays in one process** — no camera/video anywhere. ✓ · **Page is hostile / agent proposes, human disposes** — N/A: the probe issues no page actions and no guarded actions; it only times model responses. ✓

## 5. Tests

Fixture-free (no gesture threshold), so the "fixture replay" clause does not apply; the test surface is the harness against a deterministic stub:

- **`apps/playground/test/latency-probe.test.ts`** (Vitest, the agent-side verification, camera- and key-free, runs in CI via `pnpm test`): drives `runProbe` against **`latency-probe-stub.ts`**, a `node:http` OpenAI-compatible server streaming canned SSE (content deltas with a measurable inter-chunk delay, a `tool_calls` delta, and a `json_schema`-valid final message). Asserts: SSE chunks parsed to first-content; first-content latency measured per call; **p50/p95 computed** correctly over N runs (checked against a known synthetic distribution); **tool-calling detected** (model returned `tool_calls`); **`json_schema` detected** (structured output present and schema-valid); `LATENCY_COLUMNS` header and CSV rows well-formed. Pure-function coverage for the percentile and SSE-parse helpers in the same file.
- **Live numbers** (owner, gate-deciding): the CLI against the real provider — the p50/p95 that actually clear (or miss) the ≤ 3 s gate. This needs the owner's key and endpoint, so it is an owner step (see Exit checks E1/E3 and `## Status` → NEEDS-OWNER), recorded in `spike-results.md §G7`.

## Files

Exact paths the implementing (execute) session creates/modifies; the next session's write scope is derived from this block.

**Files:**
- Create `apps/playground/src/latency-probe.ts` — pure harness: SSE parser, per-call first-content latency, percentiles (p50/p95), capability detection, 150-item snapshot builder, runProbe(config, fetchLike), latency columns + CSV emitter. No browser globals; no apiKey/API_KEY identifier.
- Create `apps/playground/src/latency-probe-cli.ts` — Node CLI (owner runs live): reads LLM_PROVIDER_BASE_URL, LLM_PROVIDER_KEY, LLM_FAST_MODEL, LLM_PLANNER_MODEL; runs N iterations for fast and planner; prints p50/p95 + capability table + a CSV block for spike-results.md §G7.
- Test `apps/playground/test/latency-probe-stub.ts` — node:http OpenAI-compatible stub streaming canned SSE (content + tool_calls + json_schema final) with a configurable inter-chunk delay.
- Test `apps/playground/test/latency-probe.test.ts` — Vitest against the stub (§5).
- Modify `apps/playground/package.json` — add a probe:latency script (node src/latency-probe-cli.ts); no new dependency.
- Modify `docs/spike-results.md` — §G7 Setup filled by the execute session; Result/numbers + capability flags filled after the owner's live run.

## Exit checks

Not frozen by this docs-only planning session (the lock `docs/sdd/0E/exit-checks.lock` is out of scope; the execute/driver session freezes it once the commands run and `exit-check 0E --fast` is green). Criterion cells are verbatim: E1–E2 from the roadmap row's **Exit** cell (split at `;`), E3 from its **Agent verification** cell.

| # | Criterion (verbatim) | Kind | Check |
|---|---|---|---|
| E1 | p50/p95 logged | owner | - |
| E2 | provider and model ids entered in §8 | owner | - |
| E3 | Runs with owner's key; agent reads the numbers | owner | - |

All three exit criteria are owner-gated: G7 measures a real provider under the owner's key, so the deciding numbers cannot be produced in CI. The **agent-side** verification is the camera-/key-free stub test `apps/playground/test/latency-probe.test.ts` (§5), which `pnpm test` runs in CI to prove the harness parses streaming, times first-content, computes p50/p95, and detects tool-calling and `json_schema`. The roadmap 0E row lists no "Interfaces fixed here", so there are no `I` rows.

## Status

_Owned by the 0E session; rewritten, not appended._

**Done (session 0, plan):**
- Read inputs: roadmap §3.2 (0E row) + §5.1 (2A, to keep interfaces out of this probe), `03-tech-stack §1/§4/§5.7`, `spike-results.md §G7`, the 0A fixed interfaces (`BENCH_COLUMNS` CSV idiom) and the 0D probe precedent (playground placement, E3-from-agent-verification, docs-only-first-session flow).
- Wrote this plan (five questions), the `**Files:**` block, and the `## Exit checks` table (unfrozen — lock out of scope).
- Placement decided: `apps/playground` Node CLI + pure harness + `node:http` stub; no new package, no `packages/protocol` change, `agent-core` not built (2A owns it).

**Done (session 1, execute):**
- Implemented the `**Files:**` block under `obra-test-driven-development` (test failed first on the missing harness, then green): `src/latency-probe.ts` (SSE parse, first-suggestion timing, nearest-rank p50/p95, tool-calling + `json_schema` detection, 150-item snapshot, `LATENCY_COLUMNS` CSV), `test/latency-probe-stub.ts` (`node:http` OpenAI-compatible SSE stub), `test/latency-probe.test.ts` (12 cases, the E3 agent verification), `src/latency-probe-cli.ts` (owner live runner), `package.json` `probe:latency` script.
- One deviation from the `**Files:**` block, noted here (no ADR — not a §1–2 break): `tsconfig.json` gains `allowImportingTsExtensions: true`. Node 24 native TS (the 0A `scripts/fixtures/*` precedent, no `tsx`) requires a `.ts` import specifier for the CLI→harness import (verified empirically: `.js` and extensionless both fail to resolve); the flag lets `tsc` accept it. Consistent with the plan's "no new dependency / native Node TS" stance; tests keep the `.js` specifier (Vitest resolves both).
- Verification (§5): `pnpm --filter @gesture/playground test` → 22 passed; `typecheck` clean; `node scripts/lint/boundary-lint.mjs` → OK; CLI smoke-tested (env validation, `.ts` import resolves under Node 24).
- Filled `spike-results.md §G7` Setup; handed off `NEEDS-OWNER` for the live run.

**Done (session 1, owner live run 2026-09-06):**
- Owner ran the CLI against **9router** (`http://localhost:20128/v1`), 10 iterations, 150-item snapshot. Recorded in `spike-results.md §G7`: fast `deepseel-v4-flash` p50 **1574 ms** (p95 2105), planner `glm-5.2` p50 **2653 ms** (p95 3886) — both first-suggestion p50 ≤ 3000 ms ⇒ **gate MET (GO)**. Capability flags: fast `tool-calling N / json_schema Y`; planner `tool-calling Y / json_schema Y`.

**In progress:** none.

**Next:** owner logs the roadmap §8 row (drafted below) and removes the 0E STATUS row (owner-only, or the `driving-a-milestone` driver via `scripts/milestone/log-decision --apply`). Milestone 0E exits.

**Proposed decision(s) for roadmap §8 (owner logs; agent does not edit §8):**
> **G7 (0E) agent latency probe = GO (2026-09-06).** Provider **9router** (OpenAI-compatible gateway); **fast** model `deepseel-v4-flash` (first-suggestion p50 1574 ms / p95 2105 ms; tool-calling N, json_schema Y), **planner** model `glm-5.2` (p50 2653 ms / p95 3886 ms; tool-calling Y, json_schema Y). First-suggestion p50 ≤ 3 s met for both (gate is on p50). **Caveat → 2A:** the fast model is json_schema-only; if the suggestion loop needs tool-calling on the fast path, use `glm-5.2` for the fast role (still 2653 ms p50, clears the gate). Evidence: `spike-results.md §G7`. Unblocks 2A plan inputs (roadmap §5.1 — provider, model ids, `json_schema` support).

**Blockers:** none. (Live run done; §8 logging + STATUS-row removal are owner-only bookkeeping.)

**Superpowers conflicts noted (`CLAUDE.md §6`):** none material; no open design question required the brainstorm companion, so the plan was written directly (the five questions are all answerable from the roadmap row + `03-tech-stack`), matching the 0D docs-only planning session.
