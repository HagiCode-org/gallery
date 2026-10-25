// Loads every configured album's index once per build and derives the cover and thumbnail geometry. Build-time only.
import { ALBUMS, type Album } from '../../config/albums.ts';
import type { GalleryIndex, IndexEntry, IndexSheet, SheetCell } from './indexSchema.ts';
import { fetchIndex, objectUrl, type SourceOptions } from './source.ts';

export interface LoadedAlbum {
  readonly album: Album;
  readonly index: GalleryIndex;
}

export interface LoaderOptions {
  readonly albums: readonly Album[];
  readonly source?: SourceOptions;
  readonly warn?: (message: string) => void;
}

// Where a sheet cell sits in its sheet, as CSS for a box that shows one cell. `size` scales the whole sheet to
// `columns x rows` boxes; `position` moves the box to the cell. A percentage position p maps to the cell at p of the
// spare width, so column c of n columns is c / (n - 1).
export interface SheetCellGeometry {
  readonly size: string;
  readonly position: string;
}

// `bytes` is the size the index lists for the file that `url` points at, which the client checks against its cache.
export type Thumbnail =
  | { readonly kind: 'sheet'; readonly url: string; readonly bytes: number; readonly size: string; readonly position: string }
  | { readonly kind: 'image'; readonly url: string; readonly bytes: number; readonly width: number; readonly height: number };

// What an album that is listed before its first publish carries: no images, so the card and page show it as empty.
const EMPTY_INDEX: GalleryIndex = { version: 1, range: { count: 0, first: null, last: null }, sheet: null, entries: [] };

// An album is waiting when it is listed before publish and has no images yet.
export const isPending = (loaded: LoadedAlbum): boolean => loaded.index.range.count === 0;

// The loader returns the same promise to every caller, so each album's index is requested once per build. Albums that
// answer 404 are omitted with one warning each, unless they are listed before publish, which keep an empty index; any
// other failure rejects and names the album.
export function createAlbumLoader(options: LoaderOptions): () => Promise<LoadedAlbum[]> {
  const warn = options.warn ?? (() => {});
  let pending: Promise<LoadedAlbum[]> | undefined;
  return () => {
    pending ??= loadEach(options.albums, options.source, warn);
    return pending;
  };
}

async function loadEach(
  albums: readonly Album[],
  source: SourceOptions | undefined,
  warn: (message: string) => void,
): Promise<LoadedAlbum[]> {
  const results = await Promise.all(albums.map(async (album) => ({ album, result: await fetchIndex(album, source) })));
  const loaded: LoadedAlbum[] = [];
  for (const { album, result } of results) {
    if (result.status === 'not-published') {
      if (album.listBeforePublish) {
        warn(`album "${album.slug}" is not published yet (index.json returned 404) and is listed with no images`);
        loaded.push({ album, index: EMPTY_INDEX });
        continue;
      }
      warn(`album "${album.slug}" is not published yet (index.json returned 404) and is omitted from the build`);
      continue;
    }
    loaded.push({ album, index: result.index });
  }
  return loaded;
}

export const loadAlbums = createAlbumLoader({
  albums: ALBUMS,
  warn: (message) => console.warn(`[gallery] ${message}`),
});

const spreadPercent = (step: number, steps: number): number =>
  steps <= 1 ? 0 : Number(((step / (steps - 1)) * 100).toFixed(4));

export function sheetCellGeometry(
  sheet: Pick<IndexSheet, 'columns' | 'rows'>,
  cell: Pick<SheetCell, 'column' | 'row'>,
): SheetCellGeometry {
  return {
    size: `${sheet.columns * 100}% ${sheet.rows * 100}%`,
    position: `${spreadPercent(cell.column, sheet.columns)}% ${spreadPercent(cell.row, sheet.rows)}%`,
  };
}

// The thumbnail of one entry: its cell of the sheet when both the index has a sheet and the entry has a cell,
// otherwise its own image.
export function thumbnailFor(index: GalleryIndex, entry: IndexEntry): Thumbnail {
  if (index.sheet && entry.sheetCell) {
    return {
      kind: 'sheet',
      url: objectUrl(index.sheet.objectKey),
      bytes: index.sheet.bytes,
      ...sheetCellGeometry(index.sheet, entry.sheetCell),
    };
  }
  return { kind: 'image', url: objectUrl(entry.objectKey), bytes: entry.bytes, width: entry.width, height: entry.height };
}

// The album card cover: the first entry's thumbnail. Null for an album whose index lists no image.
export function coverFor(loaded: LoadedAlbum): Thumbnail | null {
  const [first] = loaded.index.entries;
  return first ? thumbnailFor(loaded.index, first) : null;
}

// The `width / height` pair most entries share, as CSS for `aspect-ratio`. Every published album so far is uniform, so
// this is the real shape of each cell; a mixed album gets its most common shape and the rest crop. The earliest entry
// wins a tie, and an empty index falls back to a square.
export function dominantAspect(index: GalleryIndex): string {
  const counts = new Map<string, number>();
  for (const entry of index.entries) {
    const shape = `${entry.width} / ${entry.height}`;
    counts.set(shape, (counts.get(shape) ?? 0) + 1);
  }
  let best = '1 / 1';
  let bestCount = 0;
  for (const [shape, count] of counts) {
    if (count > bestCount) {
      best = shape;
      bestCount = count;
    }
  }
  return best;
}

// Up to `size` thumbnails spread evenly through the album, starting with the first entry, so the home page can fan a
// few real pictures from one album. The first element is always the cover.
export function stackFor(loaded: LoadedAlbum, size = 3): Thumbnail[] {
  const { entries } = loaded.index;
  const shown = Math.min(size, entries.length);
  return Array.from({ length: shown }, (_, step) => {
    const entry = entries[Math.floor((step * entries.length) / shown)] as IndexEntry;
    return thumbnailFor(loaded.index, entry);
  });
}

// Inline style that shows one thumbnail as a CSS background, for the elements that cannot be an <img>: sprite-sheet
// cells and the blurred glow behind a page. Empty for a plain image, which the caller renders as an <img>.
export function sheetStyle(thumbnail: Thumbnail): string {
  return thumbnail.kind === 'sheet'
    ? `background-image: url("${thumbnail.url}"); background-size: ${thumbnail.size}; background-position: ${thumbnail.position};`
    : '';
}

// The same picture as a background for any thumbnail kind. A plain image fills the box; a sheet cell keeps its geometry.
export function backgroundStyle(thumbnail: Thumbnail): string {
  return thumbnail.kind === 'sheet'
    ? sheetStyle(thumbnail)
    : `background-image: url("${thumbnail.url}"); background-size: cover; background-position: center;`;
}
