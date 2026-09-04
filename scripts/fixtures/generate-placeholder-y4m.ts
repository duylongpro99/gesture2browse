// Generates fixtures/bench/placeholder.y4m — a minimal 64x64, 10-frame, I420
// mid-gray clip. Used as Playwright's --use-file-for-fake-video-capture input so
// the bench harness runs with no real camera.
// Run:  pnpm tsx scripts/fixtures/generate-placeholder-y4m.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = 64;
const H = 64;
const FRAMES = 10;

const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420\n`, 'ascii');
const frameMarker = Buffer.from('FRAME\n', 'ascii');

const ySize = W * H;
const cSize = (W / 2) * (H / 2);
// Mid-gray I420: Y=128 (neutral luma), U=V=128 (no chroma).
const yPlane = Buffer.alloc(ySize, 128);
const uPlane = Buffer.alloc(cSize, 128);
const vPlane = Buffer.alloc(cSize, 128);

const parts: Buffer[] = [header];
for (let i = 0; i < FRAMES; i++) parts.push(frameMarker, yPlane, uPlane, vPlane);

const outPath = fileURLToPath(new URL('../../fixtures/bench/placeholder.y4m', import.meta.url));
mkdirSync(fileURLToPath(new URL('../../fixtures/bench/', import.meta.url)), { recursive: true });
writeFileSync(outPath, Buffer.concat(parts));
console.log(`wrote ${outPath} (${FRAMES} frames, ${W}x${H} I420)`);
