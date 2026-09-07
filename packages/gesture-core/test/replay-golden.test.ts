// GOLDEN REPLAY SUITE — Exit check E2.
//
// Replays fixtures/gestures/** through the real perception pipeline
// (normalize -> MlpClassifier(fixtures/models/gesture-mlp.json) -> FSM) and
// asserts a frozen golden (per-frame labels + emitted intents) plus a
// weights/threshold LOCK. Any change to the shipped weights, the feature
// version, or a gesture-timing threshold (MIN_CONFIDENCE, VOTE_FRAMES) makes
// this fail loudly, so such a change cannot land silently.
//
// The shipped model is degenerate on a clean checkout (only placeholder.json —
// a single Closed_Fist subject), so it labels every frame Closed_Fist and emits
// no intents (arming needs Open_Palm). That is a valid frozen snapshot: the lock
// still catches any weights/threshold drift. Regenerate the golden deliberately
// (with `node scripts/train/train-gesture-mlp.ts` and a new WEIGHTS_SHA256) only
// when the fixtures or the model intentionally change. Exit E1 (precision/recall
// ≥ 95 %) is owner-deferred until real recordings land (spec §3).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FixtureRecordSchema, GestureLabel } from '@gesture/protocol';
import {
  MlpClassifier,
  normalizeLandmarks,
  replayFixtureWith,
  MIN_CONFIDENCE,
  VOTE_FRAMES,
  type MlpWeights,
} from '@gesture/gesture-core';

const weightsPath = fileURLToPath(new URL('../../../fixtures/models/gesture-mlp.json', import.meta.url));
const fixturePath = fileURLToPath(new URL('../../../fixtures/gestures/placeholder.json', import.meta.url));

// ---- FROZEN GOLDEN (update deliberately; see header) -------------------------
const WEIGHTS_SHA256 = '26e6e7670970ed49bfbaba13e2c37f7f47eb3021aa2615f0759a845d6ea90194';
const FEATURE_VERSION = 'wrist-centered-63/v1';
const GOLDEN_MIN_CONFIDENCE = 0.5;
const GOLDEN_VOTE_FRAMES = 3;
const GOLDEN_LABELS = Array.from({ length: 30 }, () => 'Closed_Fist');
const GOLDEN_INTENTS: string[] = [];

describe('golden replay suite (E2)', () => {
  const weightsRaw = readFileSync(weightsPath);
  const weights = JSON.parse(weightsRaw.toString('utf8')) as MlpWeights;
  const rec = FixtureRecordSchema.parse(JSON.parse(readFileSync(fixturePath, 'utf8')));
  const classifier = new MlpClassifier(weights);

  it('locks the shipped weights artifact (fails loudly on any weights change)', () => {
    const sha = createHash('sha256').update(weightsRaw).digest('hex');
    expect(sha).toBe(WEIGHTS_SHA256);
    expect(weights.labels).toEqual(GestureLabel.options);
    expect(weights.featureVersion).toBe(FEATURE_VERSION);
  });

  it('locks the gesture-timing thresholds (fails loudly on a threshold change)', () => {
    expect(MIN_CONFIDENCE).toBe(GOLDEN_MIN_CONFIDENCE);
    expect(VOTE_FRAMES).toBe(GOLDEN_VOTE_FRAMES);
  });

  it('replays to the frozen per-frame label sequence', () => {
    const labels = rec.frames
      .filter((f) => f.present && f.landmarks !== undefined)
      .map((f) => classifier.classify(normalizeLandmarks(f.landmarks as number[])).label);
    expect(labels).toEqual(GOLDEN_LABELS);
  });

  it('replays to the frozen intent sequence through the FSM', () => {
    const intents = replayFixtureWith(rec, classifier).map((i) => i.type);
    expect(intents).toEqual(GOLDEN_INTENTS);
  });
});
