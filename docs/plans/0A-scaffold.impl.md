# 0A — Scaffold, harness, `gesture-core` v0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `obra-subagent-driven-development` (recommended) or `obra-executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. One execute session per task in the 0A worktree; each task is one commit whose body first line is `[<component>] task <N>: <title>`. Do not re-open placement or the interfaces fixed in `0A-scaffold.spec.md`.

**Goal:** Stand up the pnpm/Turborepo monorepo with the `protocol`, `gesture-core`, `page-index` packages, the WXT extension and playground apps, the fixture format + recorder/player, a headless bench harness, and CI — so `pnpm build`/`pnpm test` are green from a clean clone and the three interfaces fixed here (fixture record, `GestureFrame` v0, bench CSV) are usable by 0B/0D/1A.

**Architecture:** All cross-boundary shapes are Zod schemas in `packages/protocol`. `packages/gesture-core` is pure TS (filter, normalizer, features, classifier interface + kNN placeholder, XState FSM skeleton, `replayFixture`) and imports types from `protocol`. `apps/playground` runs a bench harness against a placeholder y4m; fixtures are raw-landmark JSON validated by the protocol schema. CI runs lint + Vitest + Playwright (fake webcam) + extension zip.

**Tech Stack:** pnpm workspaces + Turborepo; TypeScript 5.x strict; tsup (packages); WXT + React 19 (extension); Vitest + happy-dom; Playwright (fake device y4m); XState v5; Zod v4; `@mediapipe/tasks-vision`.

**Spec:** `docs/plans/0A-scaffold.spec.md` (read it alongside this plan).

## Global Constraints

Owning rule files (every task's boundary check runs against these; a violation is a blocker unless an ADR is linked): `.claude/rules/protocol.md`, `.claude/rules/gesture-core.md`, `.claude/rules/fixtures-and-tests.md`, `.claude/rules/page-index.md`.

- TypeScript **strict**; no `any`, no `@ts-ignore` without an ADR (CLAUDE.md §2).
- `packages/protocol` depends on **`zod` only**; every cross-boundary shape is defined there first (`protocol.md`).
- `packages/gesture-core` depends on **pure TS, `xstate`, `zod`, and `@gesture/protocol` (types only)** — the `@gesture/protocol` allowance is added to `.claude/rules/gesture-core.md` in Task 3; no DOM, `chrome.*`, `fetch`, or timers outside XState (`gesture-core.md`). All gesture timing/hysteresis/cooldown/confidence gating lives in the XState machine and nowhere else.
- Packages export only via `package.json` `exports`; no deep imports (both rule files).
- New runtime dependency ⇒ a row in `docs/03-tech-stack.md` (CLAUDE.md §2). The deps here (`zod`, `xstate`, `wxt`, `react`, `@mediapipe/tasks-vision`, `tsup`, `vitest`, `@playwright/test`, `happy-dom`, `turbo`, `typescript`, eslint/prettier) are already listed in tech-stack §1–2; pin `@mediapipe/tasks-vision` to an exact version and ship its wasm locally (no CDN).
- Playwright always launches with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<y4m from fixtures/>` (`fixtures-and-tests.md`).
- Workspace package names: `@gesture/protocol`, `@gesture/gesture-core`, `@gesture/page-index`. Apps: `@gesture/extension`, `@gesture/playground`.
- Names come from `02-architecture §6`; no synonyms (`GestureFrame`, `Intent`, `FixtureRecord`, `A11yItem`, …).

**Contract tests already present (written by the plan session, FROZEN — execute makes them pass and must never edit them):**
`packages/protocol/test/contracts/fixture-record.contract.test.ts`, `.../gestureframe-v0.contract.test.ts`, `.../bench-csv.contract.test.ts`. Task 2 must make all three pass without modifying them.

---

### Task 1: Monorepo scaffold and tooling

**Files:**
- Create: `package.json` (root), `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore` (append build outputs), `.npmrc`, `vitest.workspace.ts`, `eslint.config.js`, `.prettierrc.json`
- Create: `packages/protocol/package.json`, `packages/protocol/tsconfig.json`, `packages/protocol/tsup.config.ts`, `packages/protocol/src/index.ts`
- Create: `packages/gesture-core/package.json`, `packages/gesture-core/tsconfig.json`, `packages/gesture-core/tsup.config.ts`, `packages/gesture-core/src/index.ts`
- Create: `packages/page-index/package.json`, `packages/page-index/tsconfig.json`, `packages/page-index/tsup.config.ts`, `packages/page-index/src/index.ts`

**Interfaces:**
- Produces: a workspace where `pnpm install`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck` all run and exit 0. Package names `@gesture/{protocol,gesture-core,page-index}` resolvable in the workspace.

- [ ] **Step 1: Root workspace files.** `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```
Root `package.json`:
```json
{
  "name": "human-gesture",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=24" },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "happy-dom": "^15.0.0",
    "@playwright/test": "^1.47.0",
    "eslint": "^9.10.0",
    "typescript-eslint": "^8.6.0",
    "prettier": "^3.3.0",
    "tsup": "^8.3.0"
  }
}
```
`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".output/**"] },
    "test": { "dependsOn": ["^build"] },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```
`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "noUncheckedIndexedAccess": true, "esModuleInterop": true,
    "skipLibCheck": true, "declaration": true, "resolveJsonModule": true,
    "verbatimModuleSyntax": true, "isolatedModules": true
  }
}
```
`.npmrc`: `auto-install-peers=true`. `vitest.workspace.ts`:
```ts
export default ['packages/*', 'apps/playground'];
```
`eslint.config.js`: flat config with `typescript-eslint` recommended; `.prettierrc.json`: `{ "singleQuote": true, "semi": true }`. Append `dist/`, `.output/`, `node_modules/`, `.turbo/`, `test-results/` to `.gitignore`.

- [ ] **Step 2: Package skeletons.** For each of `protocol`, `gesture-core`, `page-index`, create `package.json` of the form (adjust name/deps per package):
```json
{
  "name": "@gesture/protocol",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": { "zod": "^4.0.0" },
  "devDependencies": { "tsup": "^8.3.0", "vitest": "^2.1.0", "typescript": "^5.6.0" }
}
```
`gesture-core` deps: `{ "zod": "^4.0.0", "xstate": "^5.18.0", "@gesture/protocol": "workspace:*" }`. `page-index` deps: `{ "@gesture/protocol": "workspace:*" }`. Each `tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "include": ["src"] }`. Each `tsup.config.ts`: `import { defineConfig } from 'tsup'; export default defineConfig({ entry: ['src/index.ts'], format: ['esm'], dts: true, clean: true });`. Each `src/index.ts`: `export {};` placeholder for now.

- [ ] **Step 3: Verify the workspace runs.** Run: `pnpm install && pnpm build && pnpm test && pnpm lint && pnpm typecheck`. Expected: all exit 0 (empty packages, no tests yet — vitest with no tests passes with `--passWithNoTests`; add `"test": "vitest run --passWithNoTests"` to each package).

- [ ] **Step 4: Commit.**
```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json .gitignore .npmrc vitest.workspace.ts eslint.config.js .prettierrc.json packages/protocol packages/gesture-core packages/page-index pnpm-lock.yaml
git commit -m "[protocol] task 1: monorepo scaffold and tooling"
```

---

### Task 2: `protocol` — schemas for the three fixed interfaces + Intent v0

**Files:**
- Create: `packages/protocol/src/common.ts`, `packages/protocol/src/gesture-frame.ts`, `packages/protocol/src/fixture.ts`, `packages/protocol/src/intent.ts`, `packages/protocol/src/bench.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/schemas.test.ts`
- Pre-existing (DO NOT EDIT): `packages/protocol/test/contracts/{fixture-record,gestureframe-v0,bench-csv}.contract.test.ts`

**Interfaces:**
- Produces (all exported from `@gesture/protocol`):
  - `Handedness`, `GestureLabel` (Zod enums) + inferred types.
  - `GestureFrameSchema` / `GestureFrame` — spec §3.1.
  - `FixtureRecordSchema` / `FixtureRecord`, `FixtureFrameSchema` / `FixtureFrame`, `FixtureMetaSchema` / `FixtureMeta` — spec §3.2.
  - `IntentSchema` / `Intent` (provisional v0) — spec §4.
  - `DelegateSchema`, `RecognizerSchema`, `ResolutionSchema`, `BENCH_COLUMNS` (readonly tuple), `BenchRowSchema` / `BenchRow` — spec §3.3.

- [ ] **Step 1: Write failing tests.** `packages/protocol/test/schemas.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  GestureFrameSchema, FixtureRecordSchema, IntentSchema,
  BenchRowSchema, BENCH_COLUMNS, GestureLabel,
} from '@gesture/protocol';

describe('GestureFrame v0', () => {
  it('parses a minimal frame', () => {
    const f = { ts: 1, present: true, score: 0.9, pinch: 0.2,
      fingers: [true,false,false,false,false], velocity: { vx: 0, vy: 0 },
      scale: 0.3, pointer: { x: 0.5, y: 0.5 } };
    expect(GestureFrameSchema.parse(f).present).toBe(true);
  });
  it('rejects a wrong-length fingers tuple', () => {
    expect(() => GestureFrameSchema.parse({ ts:1, present:true, score:1, pinch:0,
      fingers:[true], velocity:{vx:0,vy:0}, scale:0, pointer:{x:0,y:0} })).toThrow();
  });
});

describe('FixtureRecord', () => {
  it('parses a one-frame record and requires 63-length landmarks', () => {
    const rec = { schema: 'gesture-fixture/v0',
      meta: { subjectId:'s1', gestureLabel:'none', distanceM:1.0, palmOrientation:'toward',
        handedness:'Right', fps:30, recordedAt:'2026-09-04T00:00:00Z' },
      frames: [{ ts:0, present:true, landmarks: Array(63).fill(0) }] };
    expect(FixtureRecordSchema.parse(rec).frames.length).toBe(1);
    const bad = { ...rec, frames: [{ ts:0, present:true, landmarks: Array(60).fill(0) }] };
    expect(() => FixtureRecordSchema.parse(bad)).toThrow();
  });
});

describe('Intent v0', () => {
  it('parses Arm/Pause/Scroll', () => {
    expect(IntentSchema.parse({ type:'Arm' }).type).toBe('Arm');
    expect(IntentSchema.parse({ type:'Scroll', dy: 12 }).type).toBe('Scroll');
  });
});

describe('Bench schema', () => {
  it('BenchRow has exactly one field per BENCH_COLUMNS entry', () => {
    const row: Record<string, unknown> = {};
    for (const c of BENCH_COLUMNS) row[c] = typeof c === 'string' ? 0 : 0;
    row.device='m1'; row.delegate='webgl'; row.recognizer='handlandmarker';
    row.resolution='480p'; row.notes='';
    const parsed = BenchRowSchema.parse(row);
    expect(Object.keys(parsed).sort()).toEqual([...BENCH_COLUMNS].sort());
  });
});

it('GestureLabel includes the mandatory none class', () => {
  expect(GestureLabel.options).toContain('none');
});
```

- [ ] **Step 2: Run to verify fail.** Run: `pnpm --filter @gesture/protocol test`. Expected: FAIL (modules/exports missing).

- [ ] **Step 3: Implement the schemas.** `src/common.ts`:
```ts
import { z } from 'zod';
export const Handedness = z.enum(['Left', 'Right']);
export type Handedness = z.infer<typeof Handedness>;
export const GestureLabel = z.enum([
  'none','Closed_Fist','Open_Palm','Pointing_Up',
  'Thumb_Down','Thumb_Up','Victory','ILoveYou',
]);
export type GestureLabel = z.infer<typeof GestureLabel>;
```
`src/gesture-frame.ts`:
```ts
import { z } from 'zod';
import { Handedness, GestureLabel } from './common.js';
export const GestureFrameSchema = z.object({
  ts: z.number(), present: z.boolean(),
  handedness: Handedness.optional(), gesture: GestureLabel.optional(),
  score: z.number(), pinch: z.number(),
  fingers: z.tuple([z.boolean(),z.boolean(),z.boolean(),z.boolean(),z.boolean()]),
  velocity: z.object({ vx: z.number(), vy: z.number() }),
  scale: z.number(), pointer: z.object({ x: z.number(), y: z.number() }),
  landmarks: z.array(z.number()).length(63).optional(),
});
export type GestureFrame = z.infer<typeof GestureFrameSchema>;
```
`src/fixture.ts`:
```ts
import { z } from 'zod';
import { Handedness, GestureLabel } from './common.js';
export const FixtureFrameSchema = z.object({
  ts: z.number(), present: z.boolean(),
  landmarks: z.array(z.number()).length(63).optional(),
  worldLandmarks: z.array(z.number()).length(63).optional(),
  score: z.number().optional(),
});
export type FixtureFrame = z.infer<typeof FixtureFrameSchema>;
export const FixtureMetaSchema = z.object({
  subjectId: z.string(), gestureLabel: GestureLabel,
  distanceM: z.union([z.literal(0.5), z.literal(1.0), z.literal(1.5)]),
  palmOrientation: z.enum(['toward','away']), handedness: Handedness,
  fps: z.number(), source: z.string().optional(), recordedAt: z.string(),
  lighting: z.string().optional(), notes: z.string().optional(),
});
export type FixtureMeta = z.infer<typeof FixtureMetaSchema>;
export const FixtureRecordSchema = z.object({
  schema: z.literal('gesture-fixture/v0'),
  meta: FixtureMetaSchema, frames: z.array(FixtureFrameSchema),
});
export type FixtureRecord = z.infer<typeof FixtureRecordSchema>;
```
`src/intent.ts`:
```ts
import { z } from 'zod';
// PROVISIONAL v0 — 1A finalizes/extends. Do not treat as frozen.
export const IntentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Arm') }),
  z.object({ type: z.literal('Pause') }),
  z.object({ type: z.literal('Scroll'), dy: z.number() }),
]);
export type Intent = z.infer<typeof IntentSchema>;
```
`src/bench.ts`:
```ts
import { z } from 'zod';
export const DelegateSchema = z.enum(['webgl','wasm']);
export const RecognizerSchema = z.enum(['handlandmarker','gesturerecognizer']);
export const ResolutionSchema = z.enum(['480p','720p']);
export const BENCH_COLUMNS = [
  'device','delegate','recognizer','resolution','numHands',
  'frames','durationMs','fpsMean','fpsP50','fpsP05',
  'captureMsP50','inferMsP50','normalizeMsP50','classifyMsP50','filterMsP50','totalMsP50',
  'inferMsP95','coldInitMs','droppedFrames','notes',
] as const;
export const BenchRowSchema = z.object({
  device: z.string(), delegate: DelegateSchema, recognizer: RecognizerSchema,
  resolution: ResolutionSchema, numHands: z.number(),
  frames: z.number(), durationMs: z.number(),
  fpsMean: z.number(), fpsP50: z.number(), fpsP05: z.number(),
  captureMsP50: z.number(), inferMsP50: z.number(), normalizeMsP50: z.number(),
  classifyMsP50: z.number(), filterMsP50: z.number(), totalMsP50: z.number(),
  inferMsP95: z.number(), coldInitMs: z.number(), droppedFrames: z.number(), notes: z.string(),
});
export type BenchRow = z.infer<typeof BenchRowSchema>;
```
`src/index.ts`: `export * from './common.js'; export * from './gesture-frame.js'; export * from './fixture.js'; export * from './intent.js'; export * from './bench.js';`

- [ ] **Step 4: Verify tests + contract tests pass.** Run: `pnpm --filter @gesture/protocol build && pnpm --filter @gesture/protocol test`. Expected: `schemas.test.ts` and all three `test/contracts/*.contract.test.ts` PASS.

- [ ] **Step 5: Commit.**
```bash
git add packages/protocol/src packages/protocol/test/schemas.test.ts packages/protocol/package.json
git commit -m "[protocol] task 2: GestureFrame v0, FixtureRecord, Intent v0, bench schema"
```

---

### Task 3: `gesture-core` v0 — filter, normalizer, features, classifier, FSM, replay

**Files:**
- Create: `packages/gesture-core/src/one-euro.ts`, `.../src/normalize.ts`, `.../src/features.ts`, `.../src/classifier.ts`, `.../src/machine.ts`, `.../src/replay.ts`, `.../src/constants.ts`
- Modify: `packages/gesture-core/src/index.ts`
- Modify: `.claude/rules/gesture-core.md` (add `@gesture/protocol` to allowed deps)
- Test: `packages/gesture-core/test/one-euro.test.ts`, `.../test/normalize.test.ts`, `.../test/features.test.ts`, `.../test/machine.test.ts`

**Interfaces:**
- Consumes: `@gesture/protocol` — `GestureFrame`, `Intent`, `FixtureRecord`, `GestureLabel`.
- Produces (exported from `@gesture/gesture-core`):
  - `class OneEuroFilter { constructor(o:{minCutoff:number;beta:number;dCutoff:number}); filter(x:number, tsMs:number):number }`
  - `normalizeLandmarks(raw:number[], opts?:{mirror?:boolean}):number[]` (length 63 → 63)
  - `pinchDistance(landmarks:number[]):number`; `fingerExtension(landmarks:number[]):[boolean,boolean,boolean,boolean,boolean]`
  - `interface Classifier { classify(input:number[]):{label:GestureLabel;score:number} }`; `class KnnClassifier implements Classifier`
  - `createGestureMachine()` (XState v5 actor logic) emitting `Intent`
  - `replayFixture(record:FixtureRecord):Intent[]`

- [ ] **Step 1: Update the boundary rule (required before importing protocol).** In `.claude/rules/gesture-core.md`, change the "May depend on" line to: `- **May depend on:** pure TS, \`xstate\`, \`zod\`, and \`@gesture/protocol\` (types only).` Commit this rule change together with this task (CLAUDE.md §5: a changed boundary changes its rule file in the same PR).

- [ ] **Step 2: Write failing tests.**
`test/one-euro.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { OneEuroFilter } from '@gesture/gesture-core';
describe('OneEuroFilter', () => {
  it('passes a constant signal through unchanged after warm-up', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 });
    let out = 0; for (let t = 0; t < 200; t += 33) out = f.filter(5, t);
    expect(out).toBeCloseTo(5, 1);
  });
  it('attenuates a single-sample spike', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 });
    f.filter(0, 0); const spike = f.filter(100, 33);
    expect(spike).toBeLessThan(100);
  });
});
```
`test/normalize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeLandmarks, pinchDistance, fingerExtension } from '@gesture/gesture-core';
const raw = Array.from({ length: 63 }, (_, i) => (i % 3) * 0.1 + Math.floor(i / 3) * 0.01);
describe('normalizeLandmarks', () => {
  it('places the wrist (landmark 0) at the origin', () => {
    const n = normalizeLandmarks(raw);
    expect(n[0]).toBeCloseTo(0); expect(n[1]).toBeCloseTo(0); expect(n[2]).toBeCloseTo(0);
  });
  it('returns 63 numbers', () => { expect(normalizeLandmarks(raw)).toHaveLength(63); });
});
describe('features', () => {
  it('pinchDistance is non-negative', () => { expect(pinchDistance(raw)).toBeGreaterThanOrEqual(0); });
  it('fingerExtension returns five booleans', () => { expect(fingerExtension(raw)).toHaveLength(5); });
});
```
`test/machine.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { createGestureMachine } from '@gesture/gesture-core';
describe('gesture FSM skeleton', () => {
  it('starts Paused', () => {
    const a = createActor(createGestureMachine()); a.start();
    expect(a.getSnapshot().value).toBe('Paused');
  });
});
```

- [ ] **Step 3: Run to verify fail.** Run: `pnpm --filter @gesture/gesture-core test`. Expected: FAIL (exports missing).

- [ ] **Step 4: Implement.**
`src/one-euro.ts` — standard 1€ filter (own ~40-line impl per tech-stack §1):
```ts
export class OneEuroFilter {
  private minCutoff: number; private beta: number; private dCutoff: number;
  private xPrev: number | null = null; private dxPrev = 0; private tPrev: number | null = null;
  constructor(o: { minCutoff: number; beta: number; dCutoff: number }) {
    this.minCutoff = o.minCutoff; this.beta = o.beta; this.dCutoff = o.dCutoff;
  }
  private alpha(cutoff: number, dtMs: number): number {
    const te = dtMs / 1000; const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / te);
  }
  filter(x: number, tsMs: number): number {
    if (this.xPrev === null || this.tPrev === null) { this.xPrev = x; this.tPrev = tsMs; return x; }
    const dt = Math.max(tsMs - this.tPrev, 1); this.tPrev = tsMs;
    const dx = (x - this.xPrev) / (dt / 1000);
    const aD = this.alpha(this.dCutoff, dt); const dxHat = aD * dx + (1 - aD) * this.dxPrev; this.dxPrev = dxHat;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this.alpha(cutoff, dt); const xHat = a * x + (1 - a) * this.xPrev; this.xPrev = xHat;
    return xHat;
  }
}
```
`src/normalize.ts` — `normalizeLandmarks(raw, {mirror})`: subtract landmark 0 (indices 0,1,2) from every point; scale all by `1/dist(0,9)` (0↔9 = wrist↔middle-MCP); if `mirror`, negate x. Add `pinchDistance`/`fingerExtension` helpers in `src/features.ts`:
```ts
function pt(l: number[], i: number) { return [l[i*3], l[i*3+1], l[i*3+2]] as const; }
function dist(l: number[], a: number, b: number) {
  const [ax,ay,az]=pt(l,a), [bx,by,bz]=pt(l,b);
  return Math.hypot(ax-bx, ay-by, az-bz);
}
export function pinchDistance(l: number[]): number { return dist(l,4,8) / (dist(l,0,9) || 1); }
export function fingerExtension(l: number[]): [boolean,boolean,boolean,boolean,boolean] {
  // tip vs pip further from wrist ⇒ extended; tips 4,8,12,16,20 pips 2,6,10,14,18
  const tips=[4,8,12,16,20], pips=[2,6,10,14,18];
  return tips.map((t,i)=>dist(l,0,t) > dist(l,0,pips[i])) as [boolean,boolean,boolean,boolean,boolean];
}
```
`src/classifier.ts`:
```ts
import type { GestureLabel } from '@gesture/protocol';
export interface Classifier { classify(input: number[]): { label: GestureLabel; score: number }; }
export class KnnClassifier implements Classifier {
  constructor(private samples: { label: GestureLabel; features: number[] }[] = []) {}
  classify(input: number[]): { label: GestureLabel; score: number } {
    if (this.samples.length === 0) return { label: 'none', score: 0 };
    let best = this.samples[0], bestD = Infinity;
    for (const s of this.samples) {
      const d = Math.hypot(...s.features.map((f, i) => f - (input[i] ?? 0)));
      if (d < bestD) { bestD = d; best = s; }
    }
    return { label: best.label, score: 1 / (1 + bestD) };
  }
}
```
`src/machine.ts` — XState v5 `setup()` machine: states `Paused`, `Armed` (child `Idle`, `Scrolling`); on a `GestureFrame` event tagged `Open_Palm` held (skeleton: single event `PALM_HOLD` toggles Paused↔Armed), `Closed_Fist` motion emits `Scroll`. Timing constants from `src/constants.ts` (e.g. `PALM_CLUTCH_MS = 1000`). Emit `Intent` via an `emit` action or return via context; expose an `emitted` list for `replayFixture`. `src/replay.ts`:
```ts
import type { FixtureRecord, Intent } from '@gesture/protocol';
import { normalizeLandmarks } from './normalize.js';
import { pinchDistance, fingerExtension } from './features.js';
import { KnnClassifier } from './classifier.js';
// Drives each frame through normalize → features → classifier → machine, collecting Intents.
export function replayFixture(record: FixtureRecord): Intent[] { /* iterate record.frames, feed the actor, push emitted intents */ return []; }
```
Fill `replay.ts` to actually run the actor and collect emitted `Intent`s (its detailed body is exercised by Task 5's round-trip test). `src/index.ts` re-exports all of the above.

- [ ] **Step 5: Verify tests pass.** Run: `pnpm --filter @gesture/gesture-core build && pnpm --filter @gesture/gesture-core test`. Expected: PASS.

- [ ] **Step 6: Commit.**
```bash
git add packages/gesture-core/src packages/gesture-core/test .claude/rules/gesture-core.md packages/gesture-core/package.json
git commit -m "[gesture-core] task 3: filter, normalizer, features, classifier, FSM, replay"
```

---

### Task 4: Fixtures — synthetic generator, placeholder fixture + y4m, player/recorder

**Files:**
- Create: `scripts/fixtures/generate-placeholder-fixture.ts`, `scripts/fixtures/generate-placeholder-y4m.ts`, `scripts/fixtures/play.ts`
- Create: `fixtures/gestures/placeholder.json`, `fixtures/bench/placeholder.y4m` (generated, then committed)
- Create: `fixtures/README.md` (format description + regeneration commands)
- Test: `packages/gesture-core/test/roundtrip.test.ts`

**Interfaces:**
- Consumes: `@gesture/protocol` (`FixtureRecordSchema`), `@gesture/gesture-core` (`replayFixture`).
- Produces: a committed `fixtures/gestures/placeholder.json` valid under `FixtureRecordSchema`; `fixtures/bench/placeholder.y4m`; a `play.ts` CLI that prints replayed intents.

- [ ] **Step 1: Write the failing round-trip test.** `packages/gesture-core/test/roundtrip.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FixtureRecordSchema } from '@gesture/protocol';
import { replayFixture } from '@gesture/gesture-core';
describe('fixture round-trip', () => {
  it('parses the placeholder fixture and replays without throwing', () => {
    const raw = JSON.parse(readFileSync('fixtures/gestures/placeholder.json','utf8'));
    const rec = FixtureRecordSchema.parse(raw);               // JSON → Zod
    expect(FixtureRecordSchema.parse(rec)).toEqual(rec);      // re-parse is stable
    const intents = replayFixture(rec);
    expect(Array.isArray(intents)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify fail.** Run: `pnpm --filter @gesture/gesture-core test roundtrip`. Expected: FAIL (fixture file missing).

- [ ] **Step 3: Write the generator and generate the fixture.** `scripts/fixtures/generate-placeholder-fixture.ts`: build a `FixtureRecord` (`schema:'gesture-fixture/v0'`, `meta` with `subjectId:'synthetic'`, `gestureLabel:'Closed_Fist'`, `distanceM:1.0`, `palmOrientation:'toward'`, `handedness:'Right'`, `fps:30`, `recordedAt` fixed ISO, `source:'placeholder.y4m'`), and ~30 frames whose landmarks describe a closed fist translating downward (so the FSM can, once armed, emit a `Scroll`). Validate with `FixtureRecordSchema.parse` before writing to `fixtures/gestures/placeholder.json` (pretty JSON). Run: `pnpm tsx scripts/fixtures/generate-placeholder-fixture.ts`.

- [ ] **Step 4: Write the y4m generator.** `scripts/fixtures/generate-placeholder-y4m.ts`: write a minimal 64×64, 10-frame, I420 y4m (`YUV4MPEG2 W64 H64 F30:1 Ip A1:1 C420\n`, then per-frame `FRAME\n` + `64*64 + 2*(32*32)` bytes of mid-gray). Run: `pnpm tsx scripts/fixtures/generate-placeholder-y4m.ts` → `fixtures/bench/placeholder.y4m`. Add `tsx` to root devDependencies.

- [ ] **Step 5: Write the player CLI.** `scripts/fixtures/play.ts`: read a fixture path from argv, parse with `FixtureRecordSchema`, call `replayFixture`, `console.log` the intents. (This is the roadmap "player"; the "recorder" live-camera page is added in Task 5's playground and is owner-verified.)

- [ ] **Step 6: Verify round-trip passes.** Run: `pnpm --filter @gesture/gesture-core test roundtrip`. Expected: PASS.

- [ ] **Step 7: Commit.**
```bash
git add scripts/fixtures fixtures/gestures/placeholder.json fixtures/bench/placeholder.y4m fixtures/README.md packages/gesture-core/test/roundtrip.test.ts package.json pnpm-lock.yaml
git commit -m "[fixtures] task 4: placeholder fixture + y4m, generator, player, round-trip test"
```

---

### Task 5: `playground` — bench harness with CSV export, headless on the placeholder y4m

**Files:**
- Create: `apps/playground/package.json`, `apps/playground/tsconfig.json`, `apps/playground/index.html`, `apps/playground/vite.config.ts`, `apps/playground/playwright.config.ts`
- Create: `apps/playground/src/bench.ts` (harness core), `apps/playground/src/bench-page.ts` (browser entry), `apps/playground/src/csv.ts`, `apps/playground/src/recorder.ts` (live-camera recorder, owner-run)
- Create: `apps/playground/public/models/.gitkeep` (local `hand_landmarker.task` + wasm placed here; document source in `fixtures/README.md`)
- Test: `apps/playground/test/bench.e2e.ts`

**Interfaces:**
- Consumes: `@gesture/protocol` (`BENCH_COLUMNS`, `BenchRowSchema`, `Delegate`/`Recognizer`/`Resolution`), `@gesture/gesture-core` (`normalizeLandmarks`, features), `@mediapipe/tasks-vision`.
- Produces: a `benchToCsv(rows: BenchRow[]): string` whose first line is `BENCH_COLUMNS.join(',')`; a headless-runnable bench that writes a CSV file.

- [ ] **Step 1: Write the Playwright config and the failing e2e.** `apps/playground/playwright.config.ts`: `testDir: './test'`, one Chromium project whose `launchOptions.args` include `--use-fake-device-for-media-stream` and `--use-file-for-fake-video-capture=<repo-abs path>/fixtures/bench/placeholder.y4m` (resolve from the config dir so it works from repo root), `webServer` running the playground dev/preview server. `apps/playground/test/bench.e2e.ts`: open the bench page with query `?delegate=wasm&recognizer=handlandmarker&resolution=480p&frames=10`, wait for `window.__benchDone === true`, read `window.__benchCsv`, and **assert it is a non-empty string whose first line equals `BENCH_COLUMNS.join(',')` and which has ≥ 1 data row** (the test must FAIL if `__benchCsv` is absent or empty — this is the "produced CSV" gate).

  The frozen exit check **E3** runs this via `pnpm exec playwright test -c apps/playground/playwright.config.ts` (not `--filter`, which exits 0 when no package matches). That command fails today (no config, no harness, playwright not installed) and passes only once this task builds the harness and the e2e goes green.

- [ ] **Step 2: Run to verify fail.** Run: `pnpm exec playwright test -c apps/playground/playwright.config.ts`. Expected: FAIL (no config/harness/CSV).

- [ ] **Step 3: Implement `csv.ts`.**
```ts
import { BENCH_COLUMNS, type BenchRow } from '@gesture/protocol';
export function benchToCsv(rows: BenchRow[]): string {
  const header = BENCH_COLUMNS.join(',');
  const body = rows.map(r => BENCH_COLUMNS.map(c => String((r as Record<string, unknown>)[c])).join(','));
  return [header, ...body].join('\n');
}
```

- [ ] **Step 4: Implement the harness (`bench.ts`) and page (`bench-page.ts`).** `bench.ts` runs N frames from the fake camera through: capture (time it) → `HandLandmarker.detectForVideo` (delegate/recognizer from query; time it, record cold-init separately) → `normalizeLandmarks` (time) → classifier stub (time) → 1€ filter (time). Aggregate per-stage p50/p95 and fps into one `BenchRow` (validate with `BenchRowSchema`). `bench-page.ts` reads query params, runs the harness, sets `window.__benchCsv = benchToCsv([row])`, and sets `window.__benchDone = true`. Load MediaPipe wasm/model from `public/models/` (never a CDN). If no hand is detected in the placeholder video, still emit a well-formed row (detection count in `notes`) — the exit criterion is a valid CSV, not detections (spec §7).

- [ ] **Step 5: Implement the recorder (`recorder.ts`, owner-run).** A page that opens `getUserMedia`, runs `HandLandmarker`, and on stop writes a `FixtureRecord` (raw landmarks + world) download. Minimal UI; verified by the owner, not CI.

- [ ] **Step 6: Verify e2e passes.** Run: `pnpm exec playwright test -c apps/playground/playwright.config.ts` (same command as exit check E3). Expected: PASS (header equals `BENCH_COLUMNS`, ≥ 1 row, `__benchCsv` non-empty). A `test:bench` package script may alias this for convenience, but the exit check invokes playwright directly.

- [ ] **Step 7: Commit.**
```bash
git add apps/playground package.json pnpm-lock.yaml
git commit -m "[playground] task 5: bench harness with CSV export, headless bench e2e"
```

---

### Task 6: `extension` — buildable WXT (MV3, React) skeleton

**Files:**
- Create: `apps/extension/package.json`, `apps/extension/tsconfig.json`, `apps/extension/wxt.config.ts`
- Create: `apps/extension/entrypoints/background.ts`, `apps/extension/entrypoints/offscreen/index.html`, `apps/extension/entrypoints/offscreen/main.ts`, `apps/extension/entrypoints/offscreen/inference.worker.ts` (stub), `apps/extension/entrypoints/content/index.ts` (stub), `apps/extension/entrypoints/sidepanel/index.html`, `apps/extension/entrypoints/sidepanel/App.tsx`, `apps/extension/entrypoints/sidepanel/main.tsx`, `apps/extension/entrypoints/grant-camera/index.html`, `apps/extension/entrypoints/grant-camera/main.ts`
- Create: `apps/extension/public/models/.gitkeep`

**Interfaces:**
- Consumes: `@gesture/protocol` (types only, to prove the wiring builds).
- Produces: `wxt build -b chrome` output and a zip via `wxt zip`; `pnpm --filter @gesture/extension build` exits 0.

- [ ] **Step 1: Scaffold WXT.** `wxt.config.ts` with `modules: ['@wxt-dev/module-react']`, MV3 manifest declaring `permissions: ['offscreen','sidePanel','storage','tabs','scripting']`, `optional_permissions: ['debugger']`, `optional_host_permissions: ['https://*/*']`, `host_permissions: ['<all_urls>']`. `package.json` scripts: `build: wxt build`, `zip: wxt zip`, `typecheck: tsc --noEmit`, `test: vitest run --passWithNoTests`, `lint: eslint entrypoints`. Deps: `wxt`, `react`, `react-dom`, `@wxt-dev/module-react`, `@gesture/protocol`.

- [ ] **Step 2: Minimal entrypoints.** `background.ts`: `export default defineBackground(() => {});`. `sidepanel/App.tsx`: a one-line React component ("Gesture — side panel (0A skeleton)"). `offscreen/main.ts`, `offscreen/inference.worker.ts`, `content/index.ts`, `grant-camera/main.ts`: empty stubs with a top-of-file comment naming the milestone that fills them (0B/1B/1C/1D.1). No camera/CDP/agent logic in 0A.

- [ ] **Step 3: Verify build + zip.** Run: `pnpm --filter @gesture/extension build && pnpm --filter @gesture/extension zip`. Expected: both exit 0; a `.zip` is produced under `.output/`.

- [ ] **Step 4: Commit.**
```bash
git add apps/extension package.json pnpm-lock.yaml
git commit -m "[extension] task 6: buildable WXT MV3 React skeleton"
```

---

### Task 7: CI + trust-boundary lint rules

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `scripts/lint/boundary-lint.mjs` (grep-based trust-boundary checks)
- Modify: root `package.json` (add `"lint:boundary": "node scripts/lint/boundary-lint.mjs"` and include it in `turbo run lint` via a root `lint` script, or call it directly in CI)

**Interfaces:**
- Produces: a green CI run on a clean checkout; a boundary lint that fails on the three forbidden patterns.

- [ ] **Step 1: Write the boundary lint.** `scripts/lint/boundary-lint.mjs`: fail (exit 1, print offending file:line) if `VideoFrame`/`ImageBitmap` identifiers appear outside `apps/extension/entrypoints/offscreen/**`; if `apiKey`/`API_KEY` is referenced outside `apps/extension/entrypoints/background.ts`; if any `apps/extension/entrypoints/content/**` file imports an agent package. Use `node:fs` + a recursive walk + regex; scope to `apps/` and `packages/`.

- [ ] **Step 2: Write a test fixture proving it fails, then passes.** Add a temporary file with `new VideoFrame()` under `content/`, run `node scripts/lint/boundary-lint.mjs`, expect exit 1; remove it, expect exit 0. (Document this manual check in the PR; no committed failing fixture.)

- [ ] **Step 3: Write the workflow.** `.github/workflows/ci.yml`: on push/PR, Ubuntu, Node 24, pnpm; steps: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `node scripts/lint/boundary-lint.mjs`, `pnpm typecheck`, `pnpm test`, `npx playwright install --with-deps chromium`, `pnpm exec playwright test -c apps/playground/playwright.config.ts` (the E3 bench check), `pnpm --filter @gesture/extension zip`, upload the zip + any bench CSV as artifacts. Playwright job launches Chromium headless with the fake-device flags (already in `playwright.config.ts`).

- [ ] **Step 4: Verify locally.** Run: `pnpm install --frozen-lockfile && pnpm build && pnpm lint && node scripts/lint/boundary-lint.mjs && pnpm typecheck && pnpm test`. Expected: all exit 0.

- [ ] **Step 5: Commit.**
```bash
git add .github/workflows/ci.yml scripts/lint/boundary-lint.mjs package.json
git commit -m "[fixtures] task 7: CI pipeline + trust-boundary lint"
```

---

### Task 8: `docs/spike-results.md` template (0.12)

**Files:**
- Create: `docs/spike-results.md`

**Interfaces:**
- Produces: a template that 0B–0E fill and the owner signs (G8). Docs only; owner-verified.

- [ ] **Step 1: Write the template.** One section per gate G1–G8 (from `03-tech-stack §5` / roadmap §3.2–3.3): each with a "Setup", "Result (numbers)", and "Gate met? (Y/N)" placeholder, plus a final "Go / no-go decision" block with owner sign-off line and a pointer to log it in roadmap §8. No results yet — this is the empty template.

- [ ] **Step 2: Commit.**
```bash
git add docs/spike-results.md
git commit -m "[docs] task 8: spike-results template and go/no-go record"
```

---

## Notes for the executor
- Task 0.3 (`CLAUDE.md`) is already satisfied by the repo (root `CLAUDE.md` + `.claude/rules/*`); no task here. If a top-level "Commands" quick-reference is wanted, it is optional and not required for exit.
- The three `test/contracts/*.contract.test.ts` files are frozen (plan session owns them). Task 2 makes them pass; never edit them.
- `Intent` v0 is provisional; 1A finalizes it. Do not build 1C/2A assumptions on it.
- Every task is one commit with the `[<component>] task <N>: <title>` first line; `git add` explicit paths only.

## Self-review
- **Spec coverage:** repo layout → T1/T6; protocol interfaces (GestureFrame v0, FixtureRecord, Intent v0, bench CSV) → T2; gesture-core API → T3; fixtures format+player+recorder+synthetic → T4; bench harness → T5; CI + boundary lint → T7; spike template → T8; boundary rule edit → T3 step 1. task 0.3 → noted satisfied.
- **Placeholder scan:** no TBD/TODO; config and schema code is concrete; larger harness/extension steps give exact files, params, and the essential code with specific behavior.
- **Type consistency:** `BENCH_COLUMNS`, `BenchRow`, `FixtureRecordSchema`, `GestureFrameSchema`, `IntentSchema`, `replayFixture`, `normalizeLandmarks`, `pinchDistance`, `fingerExtension`, `Classifier`/`KnnClassifier`, `createGestureMachine`, `OneEuroFilter` names match across tasks and the spec.
