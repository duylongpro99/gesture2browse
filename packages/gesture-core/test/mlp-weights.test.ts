import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GestureLabel } from '@gesture/protocol';
import { MlpClassifier, normalizeLandmarks, type MlpWeights } from '@gesture/gesture-core';

// The shipped weights artifact (Task 3): regenerable by scripts/train/train-gesture-mlp.ts.
// This asserts it loads into MlpClassifier and classifies a normalized vector without
// throwing, and that its label set is exactly the frozen GestureLabel vocabulary.
const weightsPath = fileURLToPath(
  new URL('../../../fixtures/models/gesture-mlp.json', import.meta.url),
);
const fixturePath = fileURLToPath(
  new URL('../../../fixtures/gestures/placeholder.json', import.meta.url),
);

describe('shipped gesture-mlp.json weights', () => {
  const weights = JSON.parse(readFileSync(weightsPath, 'utf8')) as MlpWeights;

  it('carries exactly the frozen GestureLabel vocabulary, in order', () => {
    expect(weights.labels).toEqual(GestureLabel.options);
  });

  it('has consistent layer shapes (63 -> hidden -> 8)', () => {
    const first = weights.layers[0];
    const last = weights.layers[weights.layers.length - 1];
    expect(first?.weights[0]).toHaveLength(63); // input dim
    expect(first?.weights.length).toBe(first?.biases.length);
    expect(last?.weights.length).toBe(GestureLabel.options.length); // output dim
    expect(last?.weights.length).toBe(last?.biases.length);
  });

  it('constructs an MlpClassifier and classifies a normalized vector without throwing', () => {
    const classifier = new MlpClassifier(weights);
    const rec = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const frame = rec.frames.find((f: { landmarks?: number[] }) => f.landmarks !== undefined);
    const norm = normalizeLandmarks(frame.landmarks as number[]);
    const { label, score } = classifier.classify(norm);
    expect(GestureLabel.options).toContain(label);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
