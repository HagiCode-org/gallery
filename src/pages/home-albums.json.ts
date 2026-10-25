import type { APIRoute } from 'astro';
import { loadAlbums, thumbnailFor } from '../lib/gallery/albums.ts';
import type { HomeAlbum } from '../lib/gallery/home.ts';

// One static manifest shared by every language. Browsers sample from the full albums without fetching their indexes
// again or embedding thousands of thumbnail candidates into every translated home page.
export const GET: APIRoute = async () => {
  const albums: HomeAlbum[] = (await loadAlbums()).map(({ album, index }) => ({
    slug: album.slug,
    featured: album.featuredOnHome === true,
    thumbnails: index.entries.map((entry) => ({ ...thumbnailFor(index, entry), key: entry.key })),
  }));
  return new Response(JSON.stringify(albums), { headers: { 'Content-Type': 'application/json' } });
};
