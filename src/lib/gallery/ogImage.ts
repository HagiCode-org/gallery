// The picture a link preview shows. Social crawlers do not read AVIF, so the album's first image is re-encoded to a
// 1200x630 JPEG by Astro's image service at build time. Build-time only: it imports astro:assets.
import { getImage } from 'astro:assets';
import type { LoadedAlbum } from './albums';
import { objectUrl } from './source';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// A site-root path to the JPEG, or undefined for an album that lists no image.
export async function ogImageFor(loaded: LoadedAlbum): Promise<string | undefined> {
  const [first] = loaded.index.entries;
  if (!first) return undefined;
  const image = await getImage({
    src: objectUrl(first.objectKey),
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fit: 'cover',
    format: 'jpeg',
    quality: 80,
  });
  return image.src;
}
