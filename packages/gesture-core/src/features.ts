// Pure geometric features over a flat landmark array (length 63, 21 points).

function pt(l: number[], i: number): [number, number, number] {
  const b = i * 3;
  return [l[b] ?? 0, l[b + 1] ?? 0, l[b + 2] ?? 0];
}

function dist(l: number[], a: number, b: number): number {
  const [ax, ay, az] = pt(l, a);
  const [bx, by, bz] = pt(l, b);
  return Math.hypot(ax - bx, ay - by, az - bz);
}

// Thumb-tip(4) to index-tip(8) separation, scaled by wrist(0)->middle-MCP(9).
export function pinchDistance(l: number[]): number {
  return dist(l, 4, 8) / (dist(l, 0, 9) || 1);
}

// A finger is extended when its tip is further from the wrist than its pip joint.
// tips 4,8,12,16,20 ; pips 2,6,10,14,18.
export function fingerExtension(l: number[]): [boolean, boolean, boolean, boolean, boolean] {
  const tips = [4, 8, 12, 16, 20];
  const pips = [2, 6, 10, 14, 18];
  return tips.map((t, i) => dist(l, 0, t) > dist(l, 0, pips[i] ?? 0)) as [
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
  ];
}
