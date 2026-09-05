import { createActor } from 'xstate';
import type { FixtureRecord, Intent } from '@gesture/protocol';
import { normalizeLandmarks } from './normalize.js';
import { KnnClassifier } from './classifier.js';
import { createGestureMachine, type FrameInput } from './machine.js';

// Drives each fixture frame through normalize -> classifier -> FSM, collecting the
// Intents the machine emits. The machine owns all timing; replay only extracts
// features and forwards frames. With an untrained placeholder classifier every
// frame is 'none', so a fixture emits Intents only once a real model is supplied.
export function replayFixture(record: FixtureRecord): Intent[] {
  const intents: Intent[] = [];
  const actor = createActor(createGestureMachine());
  actor.on('Arm', (e) => intents.push(e));
  actor.on('Pause', (e) => intents.push(e));
  actor.on('Scroll', (e) => intents.push(e));
  actor.start();

  const classifier = new KnnClassifier();
  let prevWristY: number | null = null;
  let prevTs: number | null = null;

  for (const f of record.frames) {
    if (!f.present || f.landmarks === undefined) {
      prevWristY = null;
      prevTs = null;
      actor.send({ type: 'FRAME', frame: { ts: f.ts, present: false, score: 0, velocity: { vx: 0, vy: 0 } } });
      continue;
    }
    const norm = normalizeLandmarks(f.landmarks);
    const { label, score } = classifier.classify(norm);
    // Velocity from raw wrist motion (image space); normalized wrist is pinned to origin.
    const wristY = f.landmarks[1] ?? 0;
    let vy = 0;
    if (prevWristY !== null && prevTs !== null) {
      const dt = Math.max(f.ts - prevTs, 1) / 1000;
      vy = (wristY - prevWristY) / dt;
    }
    prevWristY = wristY;
    prevTs = f.ts;

    const frame: FrameInput = {
      ts: f.ts,
      present: true,
      gesture: label,
      score,
      velocity: { vx: 0, vy },
    };
    actor.send({ type: 'FRAME', frame });
  }
  return intents;
}
