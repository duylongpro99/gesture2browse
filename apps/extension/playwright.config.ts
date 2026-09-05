import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));

// Extension e2e for gate G1 (exit check E2). The frame-pump test launches a
// persistent context with the built unpacked extension and a y4m fake camera
// (.claude/rules/fixtures-and-tests.md — Playwright always uses a fake device,
// real-camera runs are owner work). Invoked by the exit check as
// `pnpm exec playwright test -c apps/extension/playwright.config.ts`. The launch
// (persistent context, --load-extension, fake-camera flags) lives in the test
// because an unpacked-extension context cannot be expressed through `use`.
export default defineConfig({
  testDir: here,
  testMatch: '**/*.e2e.ts',
  // The gate measures a 60 s window plus model cold-init warm-up; give headroom.
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
});
