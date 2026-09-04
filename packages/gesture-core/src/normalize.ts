// Landmark normalization: wrist(0) to origin, uniform scale by wrist(0)->middle-MCP(9).
// Input and output are flat [x0,y0,z0, x1,y1,z1, ...] arrays of length 63 (21 points).

const WRIST = 0;
const MIDDLE_MCP = 9;

function at(l: number[], i: number): [number, number, number] {
  const b = i * 3;
  return [l[b] ?? 0, l[b + 1] ?? 0, l[b + 2] ?? 0];
}

export function normalizeLandmarks(raw: number[], opts?: { mirror?: boolean }): number[] {
  const [ox, oy, oz] = at(raw, WRIST);
  const [mx, my, mz] = at(raw, MIDDLE_MCP);
  const span = Math.hypot(mx - ox, my - oy, mz - oz) || 1;
  const mirror = opts?.mirror ?? false;
  const out = new Array<number>(raw.length);
  for (let i = 0; i < raw.length; i += 3) {
    const x = ((raw[i] ?? 0) - ox) / span;
    out[i] = mirror ? -x : x;
    out[i + 1] = ((raw[i + 1] ?? 0) - oy) / span;
    out[i + 2] = ((raw[i + 2] ?? 0) - oz) / span;
  }
  return out;
}
