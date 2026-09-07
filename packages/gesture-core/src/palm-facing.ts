// Pure geometry over the flat 63-array (21 landmarks x,y,z; see normalize.ts).
//
// Sign convention: landmark z follows the MediaPipe Hands convention — z
// decreases (more negative) the closer a point is to the camera, and
// increases (more positive) with depth away from the camera. The palm-plane
// normal is n = (indexMCP - wrist) x (pinkyMCP - wrist) (right-hand rule,
// wrist -> index-MCP -> pinky-MCP winding). `palmFacing` returns true (palm
// toward the camera) when n.z < 0, i.e. the normal points toward the camera
// along the same "negative = nearer" axis as landmark z. n.z > 0 means the
// normal points away from the camera (back of the hand toward the camera).

const WRIST = 0;
const INDEX_MCP = 5;
const PINKY_MCP = 17;

function pt(l: number[], i: number): [number, number, number] {
  const b = i * 3;
  return [l[b] ?? 0, l[b + 1] ?? 0, l[b + 2] ?? 0];
}

function sub(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// True when the palm faces toward the camera (normal.z < 0 — see convention above).
export function palmFacing(landmarks: number[]): boolean {
  const wrist = pt(landmarks, WRIST);
  const indexMcp = pt(landmarks, INDEX_MCP);
  const pinkyMcp = pt(landmarks, PINKY_MCP);
  const v1 = sub(indexMcp, wrist);
  const v2 = sub(pinkyMcp, wrist);
  const normal = cross(v1, v2);
  return normal[2] < 0;
}
