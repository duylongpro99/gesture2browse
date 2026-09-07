// Pure forward-pass MLP: matmul + bias, ReLU on hidden layers, softmax on the
// output layer. No fs/network — weights are constructed and passed in by the
// caller (tech-stack §1-2: no new runtime dependency, hand-rolled numerics).
import type { GestureLabel } from '@gesture/protocol';
import type { Classifier } from './classifier.js';

// One fully-connected layer: `weights` is row-major [outDim][inDim], `biases`
// has length outDim. y = W x + b.
export interface MlpLayer {
  weights: number[][];
  biases: number[];
}

export interface MlpWeights {
  // Layers in forward order. All but the last apply ReLU; the last is
  // followed by softmax (no activation applied inside the layer itself).
  layers: MlpLayer[];
  // Output-class order: index i of the final layer's output maps to labels[i].
  labels: GestureLabel[];
  // Opaque version tag for the feature extraction the weights were trained
  // against (not interpreted here; carried for caller/version-mismatch checks).
  featureVersion: string;
}

function matVec(layer: MlpLayer, x: number[]): number[] {
  const { weights, biases } = layer;
  const out = new Array<number>(weights.length);
  for (let o = 0; o < weights.length; o++) {
    const row = weights[o] ?? [];
    let sum = biases[o] ?? 0;
    for (let i = 0; i < row.length; i++) {
      sum += (row[i] ?? 0) * (x[i] ?? 0);
    }
    out[o] = sum;
  }
  return out;
}

function relu(v: number[]): number[] {
  return v.map((x) => (x > 0 ? x : 0));
}

function softmax(v: number[]): number[] {
  if (v.length === 0) return [];
  const max = Math.max(...v);
  const exps = v.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

// Runs the forward pass: hidden layers get ReLU, the final layer's raw logits
// go through softmax. Returns per-class probabilities in weights.labels order.
export function forward(weights: MlpWeights, input: number[]): number[] {
  let activation = input;
  const { layers } = weights;
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (layer === undefined) continue;
    const z = matVec(layer, activation);
    activation = i < layers.length - 1 ? relu(z) : z;
  }
  return softmax(activation);
}

export class MlpClassifier implements Classifier {
  constructor(private readonly weights: MlpWeights) {}

  classify(input: number[]): { label: GestureLabel; score: number } {
    const probs = forward(this.weights, input);
    let bestIdx = 0;
    let bestP = probs[0] ?? -Infinity;
    for (let i = 1; i < probs.length; i++) {
      const p = probs[i] ?? -Infinity;
      if (p > bestP) {
        bestP = p;
        bestIdx = i;
      }
    }
    const label = this.weights.labels[bestIdx] ?? 'none';
    return { label, score: bestP === -Infinity ? 0 : bestP };
  }
}
