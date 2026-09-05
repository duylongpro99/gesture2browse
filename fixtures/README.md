# Fixtures

Camera-free test inputs. Two kinds:

- **`gestures/*.json`** — `FixtureRecord`s (raw MediaPipe landmarks + metadata),
  validated by `FixtureRecordSchema` in `@gesture/protocol`. Replayed through
  `@gesture/gesture-core`'s `replayFixture` to produce `Intent`s. The gesture
  round-trip test (`packages/gesture-core/test/roundtrip.test.ts`, exit check E2)
  parses and replays `gestures/placeholder.json`.
- **`bench/*.y4m`** — raw I420 video clips fed to Chromium as a fake camera
  (`--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<path>`),
  so the bench harness (exit check E3) runs headless with no real webcam.

## Format — `FixtureRecord` (`gesture-fixture/v0`)

```
{ schema: "gesture-fixture/v0",
  meta:   { subjectId, gestureLabel, distanceM (0.5|1.0|1.5), palmOrientation,
            handedness, fps, source?, recordedAt, lighting?, notes? },
  frames: [ { ts, present, landmarks?[63], worldLandmarks?[63], score? } ] }
```

`landmarks` is a flat `[x0,y0,z0, x1,y1,z1, …]` of the 21 MediaPipe hand points
(length 63). The canonical schema lives in `packages/protocol/src/fixture.ts`.

## Current fixtures

- `gestures/placeholder.json` — synthetic right-hand closed fist translating
  downward, 30 frames @ 30 fps. Enough to parse and replay; not a real recording.
- `bench/placeholder.y4m` — 64×64, 10-frame, mid-gray I420 clip. A valid video
  the fake camera can play; contains no hand (the bench exit criterion is a
  well-formed CSV, not detections).

## Regenerating

The generators live in `scripts/fixtures/`. They are run with Node 24's built-in
TypeScript support (the repo requires Node ≥ 24):

```
node scripts/fixtures/generate-placeholder-y4m.ts       # -> bench/placeholder.y4m
node scripts/fixtures/generate-placeholder-fixture.ts   # -> gestures/placeholder.json
node scripts/fixtures/play.ts gestures/placeholder.json # replay -> prints Intents
```

`generate-placeholder-fixture.ts` and `play.ts` import the `@gesture/protocol` and
`@gesture/gesture-core` workspace packages by name, so they need those packages
resolvable from the repo root (root `package.json` `devDependencies`, `workspace:*`).
`generate-placeholder-y4m.ts` has no imports and runs as-is.

## Bench model and wasm (no CDN)

The bench harness (`apps/playground`, exit check E3) runs MediaPipe `HandLandmarker`
locally — never from a CDN (`03-tech-stack §2, §6`):

- **`hand_landmarker.task`** (repo root) — the MediaPipe hand-landmark model,
  `float16/1`, from
  `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`.
  Committed once at the repo root and shared with the extension (0B). Regenerate
  by re-downloading that URL.
- **wasm runtime** — shipped by the pinned `@mediapipe/tasks-vision` package; the
  playground `vite.config.ts` serves it (and the model) under `/models/` for the
  dev and preview servers, so the harness stays offline and CSP-clean.

## Real recordings

The live-camera recorder that writes these JSON records is the playground
`recorder` page (Task 5, owner-run); it is not part of CI.
