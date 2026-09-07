import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { createGestureMachine, PALM_CLUTCH_MS, SCROLL_STEP, VOTE_FRAMES, type FrameInput } from '@gesture/gesture-core';
import type { Intent } from '@gesture/protocol';

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

const palm = (ts: number, palmFacing?: boolean): FrameInput => ({
  ts,
  present: true,
  gesture: 'Open_Palm',
  score: 0.9,
  velocity: { vx: 0, vy: 0 },
  ...(palmFacing === undefined ? {} : { palmFacing }),
});
const fist = (ts: number, palmFacing?: boolean): FrameInput => ({
  ts,
  present: true,
  gesture: 'Closed_Fist',
  score: 0.9,
  velocity: { vx: 0, vy: SCROLL_STEP * 4 },
  ...(palmFacing === undefined ? {} : { palmFacing }),
});

// Palm held through the clutch time at 100 ms/frame (clears the vote).
function palmHold(ts0: number, palmFacing?: boolean): FrameInput[] {
  const frames: FrameInput[] = [];
  for (let ts = ts0; ts <= ts0 + PALM_CLUTCH_MS; ts += 100) frames.push(palm(ts, palmFacing));
  return frames;
}
function fistRun(ts0: number, count: number, palmFacing?: boolean): FrameInput[] {
  return Array.from({ length: count }, (_, k) => fist(ts0 + k * 33, palmFacing));
}

describe('3-frame confidence vote', () => {
  it('suppresses a fist run shorter than VOTE_FRAMES', () => {
    const { value, intents } = run([...palmHold(0), ...fistRun(PALM_CLUTCH_MS + 33, VOTE_FRAMES - 1)]);
    expect(intents.some((i) => i.type === 'Scroll')).toBe(false);
    expect(value).toEqual({ Armed: 'Idle' }); // armed, but no scroll fired
  });

  it('fires Scroll only once the fist has been held for VOTE_FRAMES frames', () => {
    const { value, intents } = run([...palmHold(0), ...fistRun(PALM_CLUTCH_MS + 33, VOTE_FRAMES)]);
    const scrolls = intents.filter((i) => i.type === 'Scroll');
    expect(scrolls).toHaveLength(1); // fires exactly on the VOTE_FRAMES-th frame
    expect(value).toEqual({ Armed: 'Scrolling' });
  });

  it('does not arm on a palm run shorter than VOTE_FRAMES even past the clutch time', () => {
    // Two palm frames span PALM_CLUTCH_MS but the vote is not met.
    const { value, intents } = run([palm(0), palm(PALM_CLUTCH_MS)]);
    expect(value).toBe('Paused');
    expect(intents).toHaveLength(0);
  });

  it('resets the vote when the gesture label changes mid-run', () => {
    // 2 fist, then 2 palm, then 2 fist while Armed: no single label reaches 3 in a row.
    const frames = [
      ...palmHold(0), // arm
      fist(PALM_CLUTCH_MS + 33),
      fist(PALM_CLUTCH_MS + 66),
      palm(PALM_CLUTCH_MS + 99),
      palm(PALM_CLUTCH_MS + 132),
      fist(PALM_CLUTCH_MS + 165),
      fist(PALM_CLUTCH_MS + 198),
    ];
    const { intents } = run(frames);
    expect(intents.some((i) => i.type === 'Scroll')).toBe(false);
  });
});

describe('palm-facing gate', () => {
  it('blocks arming while palmFacing === false', () => {
    const { value, intents } = run(palmHold(0, false));
    expect(value).toBe('Paused');
    expect(intents).toHaveLength(0);
  });

  it('passes when palmFacing === true', () => {
    const { value, intents } = run(palmHold(0, true));
    expect(value).toEqual({ Armed: 'Idle' });
    expect(intents).toContainEqual({ type: 'Arm' });
  });

  it('passes when palmFacing is undefined (ungated — preserves the frozen contract)', () => {
    const { value, intents } = run(palmHold(0));
    expect(value).toEqual({ Armed: 'Idle' });
    expect(intents).toContainEqual({ type: 'Arm' });
  });

  it('blocks Scroll while palmFacing === false but the fist is otherwise qualifying', () => {
    const { value, intents } = run([...palmHold(0, true), ...fistRun(PALM_CLUTCH_MS + 33, VOTE_FRAMES + 1, false)]);
    expect(intents.some((i) => i.type === 'Scroll')).toBe(false);
    expect(value).toEqual({ Armed: 'Idle' });
  });
});
