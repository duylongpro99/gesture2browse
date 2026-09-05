import type { Intent } from '@gesture/protocol';

// 0A skeleton. The service-worker agent loop (2A) and message routing (1C) fill
// this in. The `@gesture/protocol` type import proves the workspace wiring builds
// (types only — no runtime protocol dependency in 0A).
export default defineBackground(() => {
  const _intentType: Intent['type'] | null = null;
  void _intentType;
});
