/**
 * Cell-bucketed spatial index over interactable bounding boxes. Broad-phase only:
 * it returns candidate ids whose bbox touches a cell; callers do the precise
 * distance / containment test. Coordinates are viewport CSS px; `bbox = [x,y,w,h]`.
 */
export type Bbox = [number, number, number, number];

export class SpatialGrid {
  private readonly cell: number;
  private readonly buckets = new Map<string, Set<number>>();

  constructor(cellSize: number) {
    this.cell = cellSize > 0 ? cellSize : 1;
  }

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  clear(): void {
    this.buckets.clear();
  }

  insert(id: number, [x, y, w, h]: Bbox): void {
    const cx0 = Math.floor(x / this.cell);
    const cy0 = Math.floor(y / this.cell);
    const cx1 = Math.floor((x + w) / this.cell);
    const cy1 = Math.floor((y + h) / this.cell);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = this.key(cx, cy);
        let b = this.buckets.get(k);
        if (!b) {
          b = new Set();
          this.buckets.set(k, b);
        }
        b.add(id);
      }
    }
  }

  /** Ids bucketed in the cell containing (x, y). */
  near(x: number, y: number): number[] {
    const b = this.buckets.get(this.key(Math.floor(x / this.cell), Math.floor(y / this.cell)));
    return b ? [...b] : [];
  }

  /** Union of ids in every cell overlapping the query box [x,y,w,h]. */
  nearBox(x: number, y: number, w: number, h: number): number[] {
    const out = new Set<number>();
    const cx0 = Math.floor(x / this.cell);
    const cy0 = Math.floor(y / this.cell);
    const cx1 = Math.floor((x + w) / this.cell);
    const cy1 = Math.floor((y + h) / this.cell);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const b = this.buckets.get(this.key(cx, cy));
        if (b) for (const id of b) out.add(id);
      }
    }
    return [...out];
  }
}
