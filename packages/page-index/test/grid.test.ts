import { describe, it, expect } from 'vitest';
import { SpatialGrid } from '@gesture/page-index';

describe('SpatialGrid', () => {
  it('buckets by cell and returns candidates near a point', () => {
    const g = new SpatialGrid(64);
    g.insert(1, [0, 0, 40, 40]);
    g.insert(2, [500, 500, 40, 40]);
    expect(g.near(10, 10)).toContain(1);
    expect(g.near(10, 10)).not.toContain(2);
  });

  it('returns an id from every cell a bbox spans', () => {
    const g = new SpatialGrid(64);
    g.insert(7, [0, 0, 200, 10]); // spans cells (0,0)..(3,0)
    expect(g.near(10, 5)).toContain(7);
    expect(g.near(190, 5)).toContain(7);
    expect(g.near(10, 100)).not.toContain(7);
  });

  it('nearBox unions the buckets overlapping a query box', () => {
    const g = new SpatialGrid(64);
    g.insert(1, [0, 0, 10, 10]);
    g.insert(2, [500, 0, 10, 10]);
    const ids = g.nearBox(-5, -5, 20, 20);
    expect(ids).toContain(1);
    expect(ids).not.toContain(2);
  });
});
