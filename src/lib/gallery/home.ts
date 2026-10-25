import type { Thumbnail } from './albums.ts';

// A thumbnail that still knows which image of the album it belongs to, so a cover picked on the home page can be found
// again in the album.
export type HomeThumbnail = Thumbnail & { readonly key: string };

export interface HomeAlbum {
  readonly slug: string;
  readonly featured: boolean;
  readonly thumbnails: readonly HomeThumbnail[];
}

const COVER_PREFIX = 'cover=';

// The fragment an album link carries so the album page can scroll to the picture that was its cover on the home page.
// It is not a bare image key: the viewer opens an image for a bare key, and this only brings the image into view.
export const coverFragment = (key: string): string => `#${COVER_PREFIX}${encodeURIComponent(key)}`;

// The image key a `location.hash` asks to be shown, or null when the hash is anything else.
export function coverKeyFromHash(hash: string): string | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!fragment.startsWith(COVER_PREFIX)) return null;
  try {
    return decodeURIComponent(fragment.slice(COVER_PREFIX.length)) || null;
  } catch {
    return null;
  }
}

// Sample without replacement so a short album never repeats a picture within its stack or satellites.
export function samplePictures<T>(pictures: readonly T[], size: number, random = Math.random): T[] {
  const pool = [...pictures];
  const count = Math.min(size, pool.length);
  for (let position = 0; position < count; position += 1) {
    const chosen = position + Math.floor(random() * (pool.length - position));
    [pool[position], pool[chosen]] = [pool[chosen] as T, pool[position] as T];
  }
  return pool.slice(0, count);
}

// Published agent/model albums take turns being the open model panel. Remembering the last one avoids repeating it
// on the next visit; everything after the chosen lead keeps its relative order within its group.
export function orderHomeAlbums(
  albums: readonly HomeAlbum[],
  previousSlug: string | null = null,
  random = Math.random,
): HomeAlbum[] {
  const eligible = albums.filter((album) => album.featured && album.thumbnails.length > 0);
  const candidates = eligible.length > 1 ? eligible.filter((album) => album.slug !== previousSlug) : eligible;
  const [first] = samplePictures(candidates, 1, random);
  if (!first) return [...albums];
  const rest = eligible.filter((album) => album !== first);
  const others = albums.filter((album) => !eligible.includes(album));
  return [first, ...rest, ...others];
}

// The panel that takes the lead after `current` when the model room turns by itself. Panels that cannot be opened
// (no pictures yet) are skipped, and the turn wraps from the last published panel to the first.
export function nextPanelIndex(openable: readonly boolean[], current: number): number {
  const size = openable.length;
  for (let step = 1; step <= size; step += 1) {
    const candidate = (((current + step) % size) + size) % size;
    if (openable[candidate]) return candidate;
  }
  return current;
}
