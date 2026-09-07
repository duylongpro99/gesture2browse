import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { KnnClassifier, MlpClassifier, type MlpWeights } from '@gesture/gesture-core';
import { classifierFromWeights, RUNTIME_FEATURE_VERSION } from '../entrypoints/offscreen/classifier-select';

// Finding 4: the loader checked `featureVersion` was a string but never compared
// it, so a model trained on a different feature layout loaded and misclassified.
// `classifierFromWeights` must fall back to KnnClassifier on a mismatch.
const weights = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../fixtures/models/gesture-mlp.json', import.meta.url)), 'utf8'),
) as MlpWeights;

describe('classifierFromWeights', () => {
  it('sanity: the shipped weights carry the runtime feature version', () => {
    expect(weights.featureVersion).toBe(RUNTIME_FEATURE_VERSION);
  });

  it('builds an MlpClassifier when the featureVersion matches the runtime layout', () => {
    expect(classifierFromWeights(weights)).toBeInstanceOf(MlpClassifier);
  });

  it('falls back to KnnClassifier when featureVersion does NOT match the runtime layout', () => {
    const mismatched = { ...weights, featureVersion: 'wrist-centered-63/v2' };
    expect(classifierFromWeights(mismatched)).toBeInstanceOf(KnnClassifier);
  });

  it('falls back to KnnClassifier on structurally invalid weights', () => {
    expect(classifierFromWeights(null)).toBeInstanceOf(KnnClassifier);
    expect(classifierFromWeights({ labels: [], featureVersion: RUNTIME_FEATURE_VERSION })).toBeInstanceOf(
      KnnClassifier,
    );
    expect(classifierFromWeights({ layers: [], labels: [], featureVersion: 42 })).toBeInstanceOf(KnnClassifier);
  });
});
