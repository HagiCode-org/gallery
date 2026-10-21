// Where each album sits in the home page's sky. Pure geometry with no DOM or network, so the build and a test can both
// call it. The sky has two compositions because the copy sits beside the stars on a wide screen and above them on a
// narrow one: the same album gets a position in each, as a percentage of its own box.

// A small picture that hangs off an album's star. `sx` and `sy` are pixel offsets from the star's centre.
export interface SkySatellite {
  readonly sx: number;
  readonly sy: number;
  readonly size: number;
}

export interface SkyBody {
  // Percent of the whole sky, on a wide screen. The stars stay in the right-hand part, clear of the copy.
  readonly wideX: number;
  readonly wideY: number;
  // Percent of the star field, on a narrow screen, where the field is its own block under the copy.
  readonly narrowX: number;
  readonly narrowY: number;
  // Width and height of the star's picture in pixels on a wide screen. Larger albums are larger stars.
  readonly size: number;
  readonly satellites: readonly SkySatellite[];
}

export const STAR_MIN = 60;
export const STAR_MAX = 108;
// The star pictures shrink by this factor on a narrow screen, where twelve of them share a small field.
export const NARROW_SCALE = 0.72;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const round = (value: number, places = 2): number => Number(value.toFixed(places));

// Albums are placed on a sunflower spiral inside an ellipse, largest first at the centre, so a few albums sit wide apart
// and many albums fill the ellipse evenly without a collision. An album's own place never depends on a random number.
const WIDE = { cx: 72, cy: 52, rx: 24, ry: 34 } as const;
const NARROW = { cx: 50, cy: 50, rx: 36, ry: 40 } as const;

// Stars shrink as the sky fills, so twelve albums keep clear air between them.
export function crowdScale(albums: number): number {
  if (albums <= 6) return 1;
  if (albums <= 9) return 0.86;
  return 0.74;
}

// How many pictures hang off each star: more for a sparse sky, fewer for a crowded one.
export function satellitesPerStar(albums: number): number {
  if (albums <= 6) return 4;
  if (albums <= 9) return 3;
  return 2;
}

// The boxes the percentages are measured against when stars are pushed apart. A real box is wider or narrower, but the
// star sizes are fixed pixels, so these are the typical case the spacing is tuned for.
const WIDE_BOX = { width: 1100, height: 600 } as const;

// Height of the star field on a narrow screen, in rem. It grows with the sky so that a crowded sky has room.
export function narrowFieldRem(albums: number): number {
  return Math.round((15 + 2.1 * albums) * 10) / 10;
}

const TALL = 1.25;

interface Point {
  x: number;
  y: number;
}

// Pushes overlapping stars apart, a fixed number of passes, so the result is the same on every build. Positions are in
// pixels of `box`, `radii` are half the star width plus the space a name needs under it, and `inset` keeps a star inside.
function relax(points: Point[], radii: readonly number[], box: { width: number; height: number }, inset: number): void {
  const gap = 6;
  for (let pass = 0; pass < 80; pass += 1) {
    for (let a = 0; a < points.length; a += 1) {
      for (let b = a + 1; b < points.length; b += 1) {
        const first = points[a] as Point;
        const second = points[b] as Point;
        // Vertical distance counts more: a star's pictures hang above it and its name sits below it, so a neighbour
        // directly above or below needs more room than one beside it.
        const dx = second.x - first.x;
        const dy = (second.y - first.y) * TALL;
        const distance = Math.hypot(dx, dy) || 0.001;
        const wanted = (radii[a] ?? 0) + (radii[b] ?? 0) + gap;
        if (distance >= wanted) continue;
        const push = (wanted - distance) / 2;
        const ux = dx / distance;
        const uy = dy / distance;
        first.x -= ux * push;
        first.y -= (uy * push) / TALL;
        second.x += ux * push;
        second.y += (uy * push) / TALL;
      }
    }
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index] as Point;
      const room = (radii[index] ?? 0) + inset;
      point.x = Math.min(box.width - room, Math.max(room, point.x));
      point.y = Math.min(box.height - room, Math.max(room, point.y));
    }
  }
}

// `counts` is the image count of each album, in display order. `narrowHeight` is the pixel height of the narrow field.
// The result has one body per album, in the same order.
export function layoutSky(counts: readonly number[]): SkyBody[] {
  const total = counts.length;
  if (total === 0) return [];
  const largest = Math.max(...counts, 1);
  const byWeight = counts.map((_, index) => index).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || a - b);
  const rankOf = new Map(byWeight.map((index, rank) => [index, rank]));
  const hanging = satellitesPerStar(total);
  // How far a star's own pictures and its name reach beyond its edge: the space no neighbouring star should take.
  const spare = hanging >= 3 ? 36 : 28;
  const sizes = counts.map((count) => {
    const weight = Math.log1p(count) / Math.log1p(largest);
    return Math.round((STAR_MIN + (STAR_MAX - STAR_MIN) * weight) * crowdScale(total));
  });

  const spiral = (ellipse: { cx: number; cy: number; rx: number; ry: number }, box: { width: number; height: number }): Point[] =>
    counts.map((_, index) => {
      const rank = rankOf.get(index) ?? index;
      const reach = total === 1 ? 0 : Math.sqrt((rank + 0.35) / (total - 0.3));
      const turn = rank * GOLDEN_ANGLE + 0.6;
      return {
        x: ((ellipse.cx + ellipse.rx * reach * Math.cos(turn)) / 100) * box.width,
        y: ((ellipse.cy + ellipse.ry * reach * Math.sin(turn)) / 100) * box.height,
      };
    });

  // On a wide screen the stars occupy the right-hand part of the box, so the spacing is solved in that part only.
  const wideBox = { width: WIDE_BOX.width, height: WIDE_BOX.height };
  const widePoints = spiral(WIDE, wideBox);
  relax(widePoints, sizes.map((size) => size / 2 + spare), wideBox, 12);
  const narrowBox = { width: 342, height: narrowFieldRem(total) * 16 };
  const narrowPoints = spiral(NARROW, narrowBox);
  relax(narrowPoints, sizes.map((size) => (size / 2 + spare) * NARROW_SCALE), narrowBox, 8);

  return counts.map((_, index) => {
    const size = sizes[index] as number;
    const wide = widePoints[index] as Point;
    const narrow = narrowPoints[index] as Point;
    // The pictures fan across the upper half of the star, because the album's name sits under it.
    const satellites = Array.from({ length: hanging }, (_, step): SkySatellite => {
      const slot = (step + 0.5) / hanging;
      const angle = Math.PI * (1.06 + 0.88 * slot) + ((index * 0.37 + step * 0.61) % 0.3) - 0.15;
      const reachOut = size / 2 + 26 + ((index * 7 + step * 13) % 18);
      return {
        sx: round(Math.cos(angle) * reachOut, 1),
        sy: round(Math.sin(angle) * reachOut, 1),
        size: 24 + ((index * 5 + step * 9) % 13),
      };
    });

    return {
      wideX: round((wide.x / wideBox.width) * 100),
      wideY: round((wide.y / wideBox.height) * 100),
      narrowX: round((narrow.x / narrowBox.width) * 100),
      narrowY: round((narrow.y / narrowBox.height) * 100),
      size,
      satellites,
    };
  });
}
