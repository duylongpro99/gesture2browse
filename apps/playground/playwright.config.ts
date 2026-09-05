import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const y4m = resolve(here, '../../fixtures/bench/placeholder.y4m');
const PORT = 4173;

// Headless bench e2e (exit check E3). Chromium is fed the placeholder y4m as a
// fake camera so getUserMedia works with no real webcam
// (.claude/rules/fixtures-and-tests.md). Invoked directly by the exit check as
// `pnpm exec playwright test -c apps/playground/playwright.config.ts`.
export default defineConfig({
  testDir: './test',
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    permissions: ['camera'],
    // Full Chromium in new-headless mode: chrome-headless-shell does not support
    // getUserMedia / fake media capture, the new headless build does.
    channel: 'chromium',
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
