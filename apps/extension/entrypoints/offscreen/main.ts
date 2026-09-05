// 0A stub. The offscreen document owns the camera + MediaPipe frame pump (0B/G1):
// MediaStreamTrackProcessor -> Worker -> HandLandmarker on OffscreenCanvas. Raw
// video and VideoFrame/ImageBitmap never leave this document (02-architecture §1,
// trust-boundary lint). No camera logic in 0A.
export {};
