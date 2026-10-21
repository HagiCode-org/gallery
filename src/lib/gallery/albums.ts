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

// The loader returns the same promise to every caller, so each album's index is requested once per build. Albums that
// answer 404 are omitted with one warning each; any other failure rejects and names the album.
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
