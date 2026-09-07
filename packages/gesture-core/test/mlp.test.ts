import { describe, it, expect } from 'vitest';
import { MlpClassifier, forward, type MlpWeights } from '@gesture/gesture-core';

// Tiny hand-computed 2-layer network: 2 inputs -> 2 hidden (ReLU) -> 3 outputs (softmax).
// Chosen so the third output class always wins by a wide, hand-checkable margin.
const weights: MlpWeights = {
  featureVersion: 'test-v1',
  labels: ['none', 'Closed_Fist', 'Open_Palm'],
  layers: [
    {
      // hidden1 = relu(1*x0 + 0*x1 + 0), hidden2 = relu(0*x0 + 1*x1 + 0)
      weights: [
        [1, 0],
        [0, 1],
      ],
      biases: [0, 0],
    },
    {
      // logits: class0 = 0, class1 = 0, class2 = 10*(hidden1+hidden2)
      weights: [
        [0, 0],
        [0, 0],
        [10, 10],
      ],
      biases: [0, 0, 0],
    },
  ],
};

describe('forward', () => {
  it('computes matmul + ReLU + softmax by hand', () => {
    const probs = forward(weights, [1, 1]);
    expect(probs).toHaveLength(3);
    // hidden = [1,1] -> logits = [0,0,20] -> softmax overwhelmingly favors index 2.
    expect(probs[2]).toBeGreaterThan(0.999);
    const sum = probs.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('zeroes negative pre-activations via ReLU', () => {
    // Negative inputs -> hidden layer clamps to 0 -> all logits 0 -> uniform softmax.
    const probs = forward(weights, [-1, -1]);
    expect(probs[0]).toBeCloseTo(1 / 3, 6);
    expect(probs[1]).toBeCloseTo(1 / 3, 6);
    expect(probs[2]).toBeCloseTo(1 / 3, 6);
  });
});

describe('MlpClassifier', () => {
  const classifier = new MlpClassifier(weights);

  it('picks the argmax class and maps it through labels', () => {
    const { label, score } = classifier.classify([1, 1]);
    expect(label).toBe('Open_Palm');
    expect(score).toBeGreaterThan(0.999);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('returns a softmax score within [0,1] for a low-signal input', () => {
    const { label, score } = classifier.classify([-1, -1]);
    expect(['none', 'Closed_Fist', 'Open_Palm']).toContain(label);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
