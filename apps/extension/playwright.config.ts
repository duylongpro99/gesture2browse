import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));

// Extension e2e for the Phase-0 gate probes (exit checks E2). Each test launches
// its own persistent context with the built unpacked extension and a y4m fake
// camera (.claude/rules/fixtures-and-tests.md — Playwright always uses a fake
// device, real-camera runs are owner work); the launch (persistent context,
// --load-extension, fake-camera flags) lives in each test because an
// unpacked-extension context cannot be expressed through `use`, and because the
// two probes need different flags:
//   - frame-pump (G1) keeps --use-fake-ui-for-media-stream (auto-accept prompt);
//   - camera-grant (G2) omits it and pre-grants the camera to the extension
//     origin, so it proves the offscreen/grant path from a real origin grant
//     rather than an auto-accepted prompt.
// Invoked by the exit checks as
// `pnpm exec playwright test -c apps/extension/playwright.config.ts [<file>]`.
export default defineConfig({
  testDir: here,
  // A single window measured by G1 is 60 s + model cold-init warm-up; give headroom.
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  projects: [
    { name: 'frame-pump', testMatch: '**/frame-pump.e2e.ts' },
    { name: 'camera-grant', testMatch: '**/camera-grant.e2e.ts' },
    { name: 'scroll-slice', testMatch: '**/scroll-slice.e2e.ts' },
  ],
});
