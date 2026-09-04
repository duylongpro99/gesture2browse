// Fixture player: parse a FixtureRecord JSON and print the Intents that
// replaying it through gesture-core emits.
// Run:  pnpm tsx scripts/fixtures/play.ts fixtures/gestures/placeholder.json
import { readFileSync } from 'node:fs';
import { FixtureRecordSchema } from '@gesture/protocol';
import { replayFixture } from '@gesture/gesture-core';

const path = process.argv[2];
if (path === undefined) {
  console.error('usage: pnpm tsx scripts/fixtures/play.ts <fixture.json>');
  process.exit(1);
}

const record = FixtureRecordSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
const intents = replayFixture(record);
console.log(`${record.frames.length} frames -> ${intents.length} intents`);
for (const intent of intents) console.log(JSON.stringify(intent));
