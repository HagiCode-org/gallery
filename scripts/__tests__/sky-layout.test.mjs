import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  NARROW_SCALE,
  STAR_MAX,
  layoutSky,
  narrowFieldRem,
  satellitesPerStar,
} from '../../src/lib/gallery/constellation.ts';

const COUNTS = [1000, 720, 600, 14, 300, 40, 900, 5, 60, 150, 2, 400];

// Smallest empty distance between two star pictures, in pixels of a box the percentages are applied to.
function clearance(bodies, box, key, scale) {
  const points = bodies.map((body) => ({
    x: (body[`${key}X`] / 100) * box.width,
    y: (body[`${key}Y`] / 100) * box.height,
    radius: (body.size * scale) / 2,
  }));
  let least = Infinity;
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      const gap = Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y) - points[a].radius - points[b].radius;
      least = Math.min(least, gap);
    }
  }
  return least;
}

describe('layoutSky', () => {
  it('returns nothing for no albums', () => {
    assert.deepEqual(layoutSky([]), []);
  });

  it('is the same on every call', () => {
    assert.deepEqual(layoutSky(COUNTS.slice(0, 7)), layoutSky(COUNTS.slice(0, 7)));
  });

  it('makes a larger album a larger star, within the size range', () => {
    const bodies = layoutSky([1000, 10]);
    assert.ok(bodies[0].size > bodies[1].size);
    assert.equal(bodies[0].size, STAR_MAX);
  });

  it('hangs fewer pictures off each star as the sky fills', () => {
    assert.equal(satellitesPerStar(5), 4);
    assert.equal(satellitesPerStar(8), 3);
    assert.equal(satellitesPerStar(12), 2);
    assert.equal(layoutSky(COUNTS.slice(0, 5))[0].satellites.length, 4);
    assert.equal(layoutSky(COUNTS)[0].satellites.length, 2);
  });

  it('keeps every star on the right-hand side on a wide screen, clear of the copy', () => {
    for (const albums of [1, 3, 5, 8, 12]) {
      for (const body of layoutSky(COUNTS.slice(0, albums))) {
        assert.ok(body.wideX >= 48 && body.wideX <= 96, `${albums} albums: wideX ${body.wideX}`);
        assert.ok(body.wideY >= 5 && body.wideY <= 95, `${albums} albums: wideY ${body.wideY}`);
      }
    }
  });

  it('leaves air between the stars for one to twelve albums, wide and narrow', () => {
    for (let albums = 2; albums <= COUNTS.length; albums += 1) {
      const bodies = layoutSky(COUNTS.slice(0, albums));
      for (const box of [{ width: 1000, height: 560 }, { width: 1440, height: 640 }]) {
        assert.ok(clearance(bodies, box, 'wide', 1) > 20, `${albums} albums at ${box.width}px`);
      }
      const narrow = { width: 342, height: narrowFieldRem(albums) * 16 };
      assert.ok(clearance(bodies, narrow, 'narrow', NARROW_SCALE) > 20, `${albums} albums, narrow`);
    }
  });

  it('grows the narrow field with the sky', () => {
    assert.ok(narrowFieldRem(12) > narrowFieldRem(5));
  });
});
