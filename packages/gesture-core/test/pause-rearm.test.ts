import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { createGestureMachine, PALM_CLUTCH_MS, type FrameInput } from '@gesture/gesture-core';
import type { Intent } from '@gesture/protocol';

// Drive the machine with a scripted palm-frame sequence (fixture replay of the
// clutch toggle) and record the emitted intents + the states visited.
function run(frames: FrameInput[]): { value: unknown; intents: Intent[] } {
  const a = createActor(createGestureMachine());
  const intents: Intent[] = [];
  a.on('Arm', (e) => intents.push(e));
  a.on('Pause', (e) => intents.push(e));
  a.on('Scroll', (e) => intents.push(e));
  a.start();
  for (const frame of frames) a.send({ type: 'FRAME', frame });
  return { value: a.getSnapshot().value, intents };
}

const palm = (ts: number): FrameInput => ({
  ts,
  present: true,
  gesture: 'Open_Palm',
  score: 0.9,
  velocity: { vx: 0, vy: 0 },
});

// A continuous palm hold spanning one PALM_CLUTCH_MS at 100 ms/frame (also
// clears the vote — well over VOTE_FRAMES palm frames).
function palmHold(ts0: number): FrameInput[] {
  const frames: FrameInput[] = [];
  for (let ts = ts0; ts <= ts0 + PALM_CLUTCH_MS; ts += 100) frames.push(palm(ts));
  return frames;
}

describe('Paused re-arm symmetry (finding 1)', () => {
  it('does not re-arm within one frame after a pause-while-held', () => {
    // hold #1 arms; hold #2 (palm still up) pauses; the very next palm frame
    // must NOT re-arm — the stale clutch timer must be cleared on Paused entry.
    const armEnd = PALM_CLUTCH_MS; // last frame of hold #1
    const pauseStart = armEnd + 100;
    const pauseEnd = pauseStart + PALM_CLUTCH_MS; // pause fires here
    const nextFrame = pauseEnd + 100;

    const { value, intents } = run([
      ...palmHold(0),
      ...palmHold(pauseStart),
      palm(nextFrame),
    ]);

    expect(intents.map((i) => i.type)).toEqual(['Arm', 'Pause']);
    expect(value).toBe('Paused'); // one extra palm frame did not re-arm
  });

  it('re-arms only after a fresh full PALM_CLUTCH_MS palm hold following a pause', () => {
    const pauseStart = PALM_CLUTCH_MS + 100;
    const pauseEnd = pauseStart + PALM_CLUTCH_MS;
    const rearmStart = pauseEnd + 100;

    const { value, intents } = run([
      ...palmHold(0), // Arm
      ...palmHold(pauseStart), // Pause (palm still held)
      ...palmHold(rearmStart), // fresh hold -> Arm again
    ]);

    expect(intents.map((i) => i.type)).toEqual(['Arm', 'Pause', 'Arm']);
    expect(value).toEqual({ Armed: 'Idle' });
  });
});
