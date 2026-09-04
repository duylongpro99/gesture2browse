import type { GestureLabel } from '@gesture/protocol';

export interface Classifier {
  classify(input: number[]): { label: GestureLabel; score: number };
}

// Placeholder nearest-neighbour classifier. Replaced by a trained model later (1B);
// the Classifier interface is the replaceable seam (02-architecture §1).
export class KnnClassifier implements Classifier {
  constructor(private samples: { label: GestureLabel; features: number[] }[] = []) {}

  classify(input: number[]): { label: GestureLabel; score: number } {
    const first = this.samples[0];
    if (first === undefined) return { label: 'none', score: 0 };
    let best = first;
    let bestD = Infinity;
    for (const s of this.samples) {
      const d = Math.hypot(...s.features.map((f, i) => f - (input[i] ?? 0)));
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return { label: best.label, score: 1 / (1 + bestD) };
  }
}
