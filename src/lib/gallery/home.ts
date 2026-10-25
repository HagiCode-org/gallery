import type { Thumbnail } from './albums.ts';

export interface HomeAlbum {
  readonly slug: string;
  readonly featured: boolean;
  readonly thumbnails: readonly Thumbnail[];
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
