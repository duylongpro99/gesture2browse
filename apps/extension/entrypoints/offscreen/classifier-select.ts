import { KnnClassifier, MlpClassifier, type MlpWeights, type Classifier } from '@gesture/gesture-core';

// Pure selection of the runtime gesture classifier from a fetched weights blob
// (no fetch/DOM here so it is unit testable; the worker does the fetch and hands
// the parsed JSON in). Any invalid, structurally-wrong, or feature-version-
// mismatched weights fall back to KnnClassifier so the pump never misclassifies
// or throws.

// The feature layout the runtime `normalizeLandmarks` produces: wrist-centred,
// scale-normalized, 21 points * 3 coords = 63 values, version v1. The trained
// weights carry the same tag (scripts/train/train-gesture-mlp.ts FEATURE_VERSION);
// a mismatch means the shipped model was trained on a different feature layout
// than the runtime extracts, so its outputs would be silently wrong.
export const RUNTIME_FEATURE_VERSION = 'wrist-centered-63/v1';

export function isMlpWeights(value: unknown): value is MlpWeights {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.layers) && Array.isArray(v.labels) && typeof v.featureVersion === 'string';
}

/**
 * Build the classifier from parsed weights JSON. Falls back to KnnClassifier
 * when the JSON is not valid MlpWeights (finding: structural guard) OR when its
 * `featureVersion` does not match the runtime feature layout (finding 4: the
 * old guard checked the field was a string but never compared it, so a
 * mismatched model loaded and misclassified instead of falling back).
 */
export function classifierFromWeights(
  json: unknown,
  runtimeFeatureVersion: string = RUNTIME_FEATURE_VERSION,
): Classifier {
  if (!isMlpWeights(json)) return new KnnClassifier();
  if (json.featureVersion !== runtimeFeatureVersion) return new KnnClassifier();
  return new MlpClassifier(json);
}
