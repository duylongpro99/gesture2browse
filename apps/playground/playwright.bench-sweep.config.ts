import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// G3 bench sweep config (roadmap §7 G3): drive the 0A bench page across the full
// delegate x recognizer x resolution matrix on one machine and write the combined
// CSV to fixtures/bench/<DEVICE>.csv. Kept SEPARATE from playwright.config.ts so
// the E3 exit check (`test:bench`) stays fast and deterministic; the sweep spec is
// deliberately named `bench-sweep.ts` (not `*.e2e.ts`) so the main config ignores
// it. Same fake-camera + local-y4m setup as the main config
// (.claude/rules/fixtures-and-tests.md).
//
// Run (from repo root): DEVICE=<machine> FRAMES=600 pnpm --filter @gesture/playground bench:sweep
const here = dirname(fileURLToPath(import.meta.url));
const y4m = resolve(here, '../../fixtures/bench/placeholder.y4m');
const PORT = 4173;

export default defineConfig({
  testDir: './test',
  testMatch: 'bench-sweep.ts',
  timeout: 600_000, // full matrix at high frame counts on a slow machine (Intel Air)
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    permissions: ['camera'],
    channel: 'chromium', // new-headless build supports fake media capture
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-video-capture=${y4m}`,
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    cwd: here,
    url: `http://localhost:${PORT}/`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
