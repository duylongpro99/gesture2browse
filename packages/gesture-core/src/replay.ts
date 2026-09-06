import { createActor } from 'xstate';
import type { FixtureRecord, Intent, TransitionLogEntry } from '@gesture/protocol';
import { normalizeLandmarks } from './normalize.js';
import { KnnClassifier } from './classifier.js';
import { createGestureMachine, type FrameInput } from './machine.js';

// Render an XState state value as a dotted path: a string returns itself; an
// object returns `${key}.${dot(value[key])}` for its single active key (the
// hierarchical states this machine uses never have parallel regions).
function dottedPath(value: unknown): string {
  if (typeof value === 'string') return value;
  const obj = value as Record<string, unknown>;
  const key = Object.keys(obj)[0] as string;
  return `${key}.${dottedPath(obj[key])}`;
}

export interface GestureRunner {
  // Sends one frame through the machine and returns THAT frame's delta only:
  // the Intent(s) it emitted (typically 0-1) and the TransitionLogEntry
  // (0-1) produced by it, whenever the state value changed or an intent was
  // emitted. Callers accumulate across calls themselves (one owner for
  // timing AND log shape; the service worker's live log reuses this as-is
  // for its live-growing log, per Task 5).
  send(frame: FrameInput): { intents: Intent[]; transitions: TransitionLogEntry[] };
}

export function createGestureRunner(): GestureRunner {
  const actor = createActor(createGestureMachine());
  let buffered: Intent[] = [];
  actor.on('Arm', (e) => buffered.push(e));
  actor.on('Pause', (e) => buffered.push(e));
  actor.on('Scroll', (e) => buffered.push(e));
  actor.start();

  return {
    send(frame: FrameInput) {
      buffered = [];
      const from = dottedPath(actor.getSnapshot().value);
      actor.send({ type: 'FRAME', frame });
      const to = dottedPath(actor.getSnapshot().value);
      const emitted = buffered;

      const transitions: TransitionLogEntry[] = [];
      if (to !== from || emitted.length > 0) {
        const entry: TransitionLogEntry = { ts: frame.ts, from, to, event: 'FRAME' };
        if (emitted.length > 0) entry.intent = emitted[0];
        transitions.push(entry);
      }
      return { intents: emitted, transitions };
    },
  };
}

export function replayFrames(frames: FrameInput[]): { intents: Intent[]; transitions: TransitionLogEntry[] } {
  const runner = createGestureRunner();
  const intents: Intent[] = [];
  const transitions: TransitionLogEntry[] = [];
  for (const frame of frames) {
    const delta = runner.send(frame);
    intents.push(...delta.intents);
    transitions.push(...delta.transitions);
  }
  return { intents, transitions };
}

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
