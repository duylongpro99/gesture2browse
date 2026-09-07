import { describe, it, expect } from 'vitest';
import { replayFrames, createGestureRunner, PALM_CLUTCH_MS, SCROLL_STEP, VOTE_FRAMES, type FrameInput } from '@gesture/gesture-core';

// E1: palm held past PALM_CLUTCH_MS (and the VOTE_FRAMES vote) arms, then a run
// of fist frames with qualifying vertical velocity scrolls repeatedly once the
// fist has itself cleared the vote window.
function script(): FrameInput[] {
  const frames: FrameInput[] = [];
  // Palm hold: 100 ms/frame through the clutch time — clears the vote long before.
  for (let ts = 0; ts <= PALM_CLUTCH_MS; ts += 100) {
    frames.push({ ts, present: true, gesture: 'Open_Palm', score: 0.9, velocity: { vx: 0, vy: 0 } });
  }
  // Five fist frames: the first VOTE_FRAMES-1 are suppressed by the vote, then
  // three scrolls fire (frames 3, 4, 5).
  for (let k = 1; k <= VOTE_FRAMES + 2; k++) {
    frames.push({
      ts: PALM_CLUTCH_MS + k * 33,
      present: true,
      gesture: 'Closed_Fist',
      score: 0.9,
      velocity: { vx: 0, vy: SCROLL_STEP * 4 },
    });
  }
  return frames;
}

describe('replayFrames: Arm then repeated Scroll (E1)', () => {
  it('emits [Arm, Scroll, Scroll, Scroll]', () => {
    const { intents } = replayFrames(script());
    expect(intents.map((i) => i.type)).toEqual(['Arm', 'Scroll', 'Scroll', 'Scroll']);
  });

  it('logs Paused -> Armed.* (Arm) and Armed.Idle -> Armed.Scrolling', () => {
    const { transitions } = replayFrames(script());

    const arming = transitions.find((t) => t.intent?.type === 'Arm');
    expect(arming).toBeDefined();
    expect(arming?.from).toBe('Paused');
    expect(arming?.to.startsWith('Armed')).toBe(true);

    const scrollEnter = transitions.find((t) => t.from === 'Armed.Idle' && t.to === 'Armed.Scrolling');
    expect(scrollEnter).toBeDefined();
    expect(scrollEnter?.intent?.type).toBe('Scroll');
  });
});

describe('createGestureRunner: per-frame delta contract', () => {
  it('returns empty arrays for a frame that neither changes state nor emits an intent', () => {
    const runner = createGestureRunner();
    // First frame (Paused, no palm) tracks nothing and stays Paused: no transition, no intent.
    const result = runner.send({ ts: 0, present: false, score: 0, velocity: { vx: 0, vy: 0 } });
    expect(result.intents).toEqual([]);
    expect(result.transitions).toEqual([]);
  });

  it('returns only that frame\'s entry for an arming frame, then only that frame\'s entry for a scrolling frame', () => {
    const runner = createGestureRunner();
    // Palm frames before the arming frame: held through the clutch time and vote.
    for (let ts = 0; ts < PALM_CLUTCH_MS; ts += 100) {
      runner.send({ ts, present: true, gesture: 'Open_Palm', score: 0.9, velocity: { vx: 0, vy: 0 } });
    }

    const arming = runner.send({
      ts: PALM_CLUTCH_MS,
      present: true,
      gesture: 'Open_Palm',
      score: 0.9,
      velocity: { vx: 0, vy: 0 },
    });
    expect(arming.intents).toEqual([{ type: 'Arm' }]);
    expect(arming.transitions).toHaveLength(1);
    expect(arming.transitions[0]?.from).toBe('Paused');
    expect(arming.transitions[0]?.to).toBe('Armed.Idle');
    expect(arming.transitions[0]?.intent).toEqual({ type: 'Arm' });

    const fistFrame = (ts: number): FrameInput => ({
      ts,
      present: true,
      gesture: 'Closed_Fist',
      score: 0.9,
      velocity: { vx: 0, vy: SCROLL_STEP * 4 },
    });
    // The vote suppresses the first VOTE_FRAMES-1 fist frames (no Scroll yet).
    for (let k = 1; k < VOTE_FRAMES; k++) {
      const suppressed = runner.send(fistFrame(PALM_CLUTCH_MS + k * 33));
      expect(suppressed.intents).toEqual([]);
    }
    // The frame that completes the vote scrolls and enters Armed.Scrolling.
    const scrolling = runner.send(fistFrame(PALM_CLUTCH_MS + VOTE_FRAMES * 33));
    expect(scrolling.intents).toHaveLength(1);
    expect(scrolling.intents[0]?.type).toBe('Scroll');
    expect(scrolling.transitions).toHaveLength(1);
    expect(scrolling.transitions[0]?.from).toBe('Armed.Idle');
    expect(scrolling.transitions[0]?.to).toBe('Armed.Scrolling');
  });
});
