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

// Sample without replacement so a short album never repeats a picture within its stack or satellites. The home page
// samples once per build, so the pictures a visitor sees are fixed until the next build.
export function samplePictures<T>(pictures: readonly T[], size: number, random = Math.random): T[] {
  const pool = [...pictures];
  const count = Math.min(size, pool.length);
  for (let position = 0; position < count; position += 1) {
    const chosen = position + Math.floor(random() * (pool.length - position));
    [pool[position], pool[chosen]] = [pool[chosen] as T, pool[position] as T];
  }
  return pool.slice(0, count);
}

// The size that fits a picture inside a square of `edge` pixels. A picture already smaller than that is not enlarged.
export function fitWithin(width: number, height: number, edge: number): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
