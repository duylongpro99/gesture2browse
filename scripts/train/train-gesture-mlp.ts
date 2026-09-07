// Offline MLP trainer for the gesture classifier (1B, Task 3).
//
// Camera-free: reads fixtures/gestures/**.json (FixtureRecords), extracts
// wrist-centred scale-normalized feature vectors via gesture-core's
// `normalizeLandmarks`, splits held-out BY subjectId (subject-independent
// evaluation), trains a small MLP by SGD (gradients live here; the runtime
// forward pass is gesture-core's `forward`/`MlpClassifier`), writes the shipped
// weights artifact fixtures/models/gesture-mlp.json, and prints a per-gesture
// precision/recall + false-fires/10 min table using N-frame voting (the G4
// artifact — Exit E1, owner-deferred on the MOCK G4 row).
//
// No new runtime dependency (tech-stack §1-2): pure-TS numerics, seeded RNG so
// the artifact regenerates deterministically (the golden replay suite locks it).
//
// Run:  node scripts/train/train-gesture-mlp.ts
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { FixtureRecordSchema, GestureLabel } from '@gesture/protocol';
import { normalizeLandmarks, MlpClassifier, type MlpWeights } from '@gesture/gesture-core';

// ---- config (tunables; not gesture-timing constants) -------------------------
const FEATURE_VERSION = 'wrist-centered-63/v1';
const INPUT_DIM = 63;
const HIDDEN_DIM = 16;
const LABELS = GestureLabel.options; // frozen vocabulary; output-class order
const OUTPUT_DIM = LABELS.length;
const EPOCHS = 300;
const LEARNING_RATE = 0.05;
const VOTE_N = 3; // eval-table voting window; mirror gesture-core VOTE_FRAMES
const SEED = 0x1b2b3b4b;

// ---- seeded RNG (mulberry32) -------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
// Small symmetric init so a degenerate (single-class) dataset stays well-behaved.
function randn(): number {
  // Box-Muller from two uniforms.
  const u = rand() || 1e-9;
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---- dense layer + forward/backward (gradients here; forward mirrors mlp.ts) -
interface DenseLayer {
  weights: number[][]; // [out][in]
  biases: number[]; // [out]
}
function makeLayer(inDim: number, outDim: number): DenseLayer {
  const scale = Math.sqrt(2 / inDim); // He init for ReLU
  return {
    weights: Array.from({ length: outDim }, () =>
      Array.from({ length: inDim }, () => randn() * scale),
    ),
    biases: Array.from({ length: outDim }, () => 0),
  };
}
function relu(v: number[]): number[] {
  return v.map((x) => (x > 0 ? x : 0));
}
function matVec(layer: DenseLayer, x: number[]): number[] {
  return layer.weights.map((row, o) => {
    let sum = layer.biases[o] ?? 0;
    for (let i = 0; i < row.length; i++) sum += (row[i] ?? 0) * (x[i] ?? 0);
    return sum;
  });
}
function softmax(v: number[]): number[] {
  const max = Math.max(...v);
  const exps = v.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

interface Sample {
  features: number[];
  label: number; // index into LABELS
  subjectId: string;
}

// One SGD step over a single sample; returns cross-entropy loss for logging.
function trainStep(hidden: DenseLayer, output: DenseLayer, s: Sample): number {
  // forward
  const z1 = matVec(hidden, s.features);
  const a1 = relu(z1);
  const z2 = matVec(output, a1);
  const probs = softmax(z2);
  const loss = -Math.log((probs[s.label] ?? 1e-9) || 1e-9);

  // output layer grad: dL/dz2 = probs - onehot
  const dz2 = probs.map((p, k) => p - (k === s.label ? 1 : 0));
  const da1 = new Array<number>(HIDDEN_DIM).fill(0);
  for (let o = 0; o < OUTPUT_DIM; o++) {
    const row = output.weights[o] as number[];
    const g = dz2[o] ?? 0;
    for (let i = 0; i < HIDDEN_DIM; i++) {
      da1[i] = (da1[i] ?? 0) + g * (row[i] ?? 0);
      row[i] = (row[i] ?? 0) - LEARNING_RATE * g * (a1[i] ?? 0);
    }
    output.biases[o] = (output.biases[o] ?? 0) - LEARNING_RATE * g;
  }
  // hidden layer grad through ReLU
  const dz1 = da1.map((d, i) => ((z1[i] ?? 0) > 0 ? d : 0));
  for (let o = 0; o < HIDDEN_DIM; o++) {
    const row = hidden.weights[o] as number[];
    const g = dz1[o] ?? 0;
    for (let i = 0; i < INPUT_DIM; i++) {
      row[i] = (row[i] ?? 0) - LEARNING_RATE * g * (s.features[i] ?? 0);
    }
    hidden.biases[o] = (hidden.biases[o] ?? 0) - LEARNING_RATE * g;
  }
  return loss;
}

// ---- data loading ------------------------------------------------------------
function findFixtures(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...findFixtures(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out.sort();
}

function loadSamples(files: string[]): Sample[] {
  const samples: Sample[] = [];
  for (const file of files) {
    const rec = FixtureRecordSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    const label = LABELS.indexOf(rec.meta.gestureLabel);
    for (const f of rec.frames) {
      if (!f.present || f.landmarks === undefined) continue;
      samples.push({
        features: normalizeLandmarks(f.landmarks),
        label,
        subjectId: rec.meta.subjectId,
      });
    }
  }
  return samples;
}

// Hold out one subject if more than one exists; otherwise evaluate on the
// training set (degenerate — flagged in the printed table; E1 owner-deferred).
function splitBySubject(samples: Sample[]): { train: Sample[]; test: Sample[]; heldOut: string | null } {
  const subjects = [...new Set(samples.map((s) => s.subjectId))].sort();
  if (subjects.length < 2) return { train: samples, test: samples, heldOut: null };
  const heldOut = subjects[subjects.length - 1] as string;
  return {
    train: samples.filter((s) => s.subjectId !== heldOut),
    test: samples.filter((s) => s.subjectId === heldOut),
    heldOut,
  };
}

// ---- evaluation with N-frame voting -----------------------------------------
// NOTE (mock-data limitations; E1 owner-deferred): the eval set is a flat frame
// list concatenated across recordings, so a voting window at a recording
// boundary can pull in the previous recording's tail, and false-fires/10 min
// below assumes 30 fps. Both are diagnostic-table artifacts, not the shipped
// model; segment per recording and read `meta.fps` once real fixtures land.
function majorityVote(labels: string[], i: number, n: number): string {
  const window = labels.slice(Math.max(0, i - n + 1), i + 1);
  const counts = new Map<string, number>();
  for (const l of window) counts.set(l, (counts.get(l) ?? 0) + 1);
  let best = window[window.length - 1] ?? 'none';
  let bestC = -1;
  for (const [l, c] of counts) if (c > bestC) { bestC = c; best = l; }
  return best;
}

function evaluate(classifier: MlpClassifier, test: Sample[]): void {
  // Per-gesture precision/recall over N-frame-voted predictions.
  const truth = test.map((s) => LABELS[s.label] as string);
  const raw = test.map((s) => classifier.classify(s.features).label);
  const voted = raw.map((_, i) => majorityVote(raw, i, VOTE_N));

  const tp = new Map<string, number>();
  const fp = new Map<string, number>();
  const fn = new Map<string, number>();
  const support = new Map<string, number>();
  for (let i = 0; i < test.length; i++) {
    const t = truth[i] as string;
    const p = voted[i] as string;
    support.set(t, (support.get(t) ?? 0) + 1);
    if (p === t) tp.set(t, (tp.get(t) ?? 0) + 1);
    else {
      fp.set(p, (fp.get(p) ?? 0) + 1);
      fn.set(t, (fn.get(t) ?? 0) + 1);
    }
  }
  // false fires: non-'none' predicted on a 'none' ground-truth frame, per 10 min.
  const noneFrames = truth.filter((t) => t === 'none').length;
  const falseFires = voted.filter((p, i) => truth[i] === 'none' && p !== 'none').length;
  const fps = 30;
  const minutes = noneFrames > 0 ? noneFrames / fps / 60 : 0;
  const falseFiresPer10 = minutes > 0 ? (falseFires / minutes) * 10 : NaN;

  console.log('\nPer-gesture precision / recall (held-out, %d-frame vote):', VOTE_N);
  console.log('gesture'.padEnd(14), 'support'.padStart(8), 'prec'.padStart(8), 'recall'.padStart(8));
  for (const label of LABELS) {
    const s = support.get(label) ?? 0;
    if (s === 0 && (tp.get(label) ?? 0) + (fp.get(label) ?? 0) === 0) continue;
    const t = tp.get(label) ?? 0;
    const prec = t + (fp.get(label) ?? 0) > 0 ? t / (t + (fp.get(label) ?? 0)) : NaN;
    const rec = s > 0 ? t / s : NaN;
    console.log(
      label.padEnd(14),
      String(s).padStart(8),
      (Number.isNaN(prec) ? '—' : prec.toFixed(3)).padStart(8),
      (Number.isNaN(rec) ? '—' : rec.toFixed(3)).padStart(8),
    );
  }
  console.log(
    'false fires / 10 min:',
    Number.isNaN(falseFiresPer10) ? '— (no "none" frames in held-out set)' : falseFiresPer10.toFixed(2),
  );
}

// ---- main --------------------------------------------------------------------
const fixturesDir = fileURLToPath(new URL('../../fixtures/gestures/', import.meta.url));
const files = findFixtures(fixturesDir);
if (files.length === 0) {
  console.error('no fixtures found under', fixturesDir);
  process.exit(1);
}
const samples = loadSamples(files);
const { train, test, heldOut } = splitBySubject(samples);
console.log(
  `loaded ${samples.length} frames from ${files.length} fixture(s); ` +
    `train=${train.length}, test=${test.length}, ` +
    (heldOut ? `held-out subject="${heldOut}"` : 'single-subject (degenerate; E1 owner-deferred)'),
);

const hidden = makeLayer(INPUT_DIM, HIDDEN_DIM);
const output = makeLayer(HIDDEN_DIM, OUTPUT_DIM);
for (let epoch = 0; epoch < EPOCHS; epoch++) {
  // Deterministic order (seeded shuffle) so the artifact is reproducible.
  const order = train.map((_, i) => i).sort((a, b) => {
    return mulberry32(SEED + epoch * 7919 + a)() - mulberry32(SEED + epoch * 7919 + b)();
  });
  let loss = 0;
  for (const idx of order) loss += trainStep(hidden, output, train[idx] as Sample);
  if (epoch === 0 || epoch === EPOCHS - 1) {
    console.log(`epoch ${epoch}: mean loss ${(loss / (train.length || 1)).toFixed(4)}`);
  }
}

const weights: MlpWeights = {
  layers: [
    { weights: hidden.weights, biases: hidden.biases },
    { weights: output.weights, biases: output.biases },
  ],
  labels: [...LABELS],
  featureVersion: FEATURE_VERSION,
};

const classifier = new MlpClassifier(weights);
evaluate(classifier, test);

const outDir = fileURLToPath(new URL('../../fixtures/models/', import.meta.url));
const outPath = join(outDir, 'gesture-mlp.json');
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(weights) + '\n');
console.log(`\nwrote ${outPath} (${OUTPUT_DIM} classes, hidden=${HIDDEN_DIM}, featureVersion=${FEATURE_VERSION})`);
