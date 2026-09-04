// Generates fixtures/gestures/placeholder.json — a synthetic FixtureRecord of a
// closed fist translating downward. Camera-free input for CI and replay.
// Run:  pnpm tsx scripts/fixtures/generate-placeholder-fixture.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FixtureRecordSchema, type FixtureRecord } from '@gesture/protocol';

const NUM_FRAMES = 30;
const FPS = 30;

// A crude right-hand "closed fist": wrist at origin, middle-MCP up the +y axis so
// the normalizer has a non-zero span, and every fingertip folded back toward the
// wrist (tip closer to wrist than its pip) so fingerExtension reads all-false.
// [x, y, z] per landmark, 21 landmarks (MediaPipe hand order).
const baseHand: [number, number, number][] = [
  [0.0, 0.0, 0.0], // 0 wrist
  [0.03, 0.05, 0.0], // 1 thumb CMC
  [0.05, 0.09, 0.0], // 2 thumb MCP (pip-equiv)
  [0.04, 0.07, 0.0], // 3 thumb IP
  [0.03, 0.05, 0.0], // 4 thumb tip (folded in)
  [0.02, 0.11, 0.0], // 5 index MCP
  [0.02, 0.14, 0.0], // 6 index PIP
  [0.02, 0.1, 0.0], // 7 index DIP
  [0.02, 0.07, 0.0], // 8 index tip (folded in)
  [0.0, 0.12, 0.0], // 9 middle MCP (span reference)
  [0.0, 0.15, 0.0], // 10 middle PIP
  [0.0, 0.1, 0.0], // 11 middle DIP
  [0.0, 0.07, 0.0], // 12 middle tip (folded in)
  [-0.02, 0.11, 0.0], // 13 ring MCP
  [-0.02, 0.14, 0.0], // 14 ring PIP
  [-0.02, 0.1, 0.0], // 15 ring DIP
  [-0.02, 0.07, 0.0], // 16 ring tip (folded in)
  [-0.04, 0.1, 0.0], // 17 pinky MCP
  [-0.04, 0.12, 0.0], // 18 pinky PIP
  [-0.04, 0.09, 0.0], // 19 pinky DIP
  [-0.04, 0.06, 0.0], // 20 pinky tip (folded in)
];

const frames = Array.from({ length: NUM_FRAMES }, (_, i) => {
  const dy = i * 0.01; // translate the whole hand downward each frame
  const landmarks = baseHand.flatMap(([x, y, z]) => [x, y + dy, z]);
  return { ts: Math.round((i * 1000) / FPS), present: true, landmarks, score: 0.9 };
});

const record: FixtureRecord = {
  schema: 'gesture-fixture/v0',
  meta: {
    subjectId: 'synthetic',
    gestureLabel: 'Closed_Fist',
    distanceM: 1.0,
    palmOrientation: 'toward',
    handedness: 'Right',
    fps: FPS,
    source: 'placeholder.y4m',
    recordedAt: '2026-09-04T00:00:00.000Z',
    notes: 'Synthetic placeholder fixture; regenerate with scripts/fixtures/generate-placeholder-fixture.ts',
  },
  frames,
};

FixtureRecordSchema.parse(record); // fail loudly if the shape drifts

const outPath = fileURLToPath(new URL('../../fixtures/gestures/placeholder.json', import.meta.url));
mkdirSync(fileURLToPath(new URL('../../fixtures/gestures/', import.meta.url)), { recursive: true });
writeFileSync(outPath, JSON.stringify(record, null, 2) + '\n');
console.log(`wrote ${outPath} (${frames.length} frames)`);
