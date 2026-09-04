---
paths:
  - "fixtures/**"
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "apps/playground/**"
---
# Fixtures, tests, playground

- Playwright always launches with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture` and a y4m from `fixtures/`. Real-camera checks are owner work.
- Recorded landmark fixtures are the agent's eyes: threshold changes replay the suite.
- Lint-as-test: fail if `VideoFrame`/`ImageBitmap` appear outside offscreen, if the API key is referenced outside `background.ts`, or if a content script imports the agent package.
- Bench output from `apps/playground` is CSV with the columns fixed in milestone 0A.
