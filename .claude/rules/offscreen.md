---
paths:
  - "apps/extension/entrypoints/offscreen/**"
---
# Offscreen document — perception pipeline

- **May depend on:** `@mediapipe/tasks-vision`, `gesture-core`, `protocol`, runtime Port.
- **Must never:** network calls, `chrome.storage`, `chrome.debugger`, exporting video/frames, gesture timing logic (belongs in the FSM).
- Video, `VideoFrame`, `ImageBitmap`, and landmarks never leave this document in steady state. Only `GestureFrame` goes over the Port.
- Frames and landmarks are not persisted unless the user records custom gestures or opts into diagnostics.
