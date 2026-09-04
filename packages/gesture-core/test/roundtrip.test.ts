import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FixtureRecordSchema } from '@gesture/protocol';
import { replayFixture } from '@gesture/gesture-core';

// Resolve from the test file so the check is independent of cwd (root vitest vs
// package-filtered vitest both work).
const fixturePath = fileURLToPath(
  new URL('../../../fixtures/gestures/placeholder.json', import.meta.url),
);

describe('fixture round-trip', () => {
  it('parses the placeholder fixture and replays without throwing', () => {
    const raw = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const rec = FixtureRecordSchema.parse(raw); // JSON -> Zod
    expect(FixtureRecordSchema.parse(rec)).toEqual(rec); // re-parse is stable
    const intents = replayFixture(rec);
    expect(Array.isArray(intents)).toBe(true);
  });
});
