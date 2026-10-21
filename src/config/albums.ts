// Albums published to img-gen.hagicode.com. Each album is one R2 prefix; the build reads its index.json.
//
// Task 1.1 probe, 2026-10-21, with `Origin: https://gallery.hagicode.com`:
// - startup-splash/hagicode-splash-001.avif: 200, image/avif, 32949 bytes, and no Access-Control-Allow-Origin header
//   on GET or HEAD. An OPTIONS preflight returns 403.
// - hero-avatars, startup-splash and cat-head-gallery index.json: 404, so no album is published yet.
// Consequence (design D7): fetch() from this origin is refused by the browser for these objects. Cache API writes
// fail silently and metadata cannot be read until img-gen answers with Access-Control-Allow-Origin. Plain <img> and
// CSS background loads are not affected. Re-run this probe when the R2 CORS rule changes.

export const IMAGE_BASE_URL = 'https://img-gen.hagicode.com';

export interface Album {
  // URL segment under /albums/. Unique across ALBUMS.
  readonly slug: string;
  // R2 prefix, the batch's output.publish.prefix. Unique across ALBUMS.
  readonly prefix: string;
  readonly title: string;
  readonly description: string;
}

export const ALBUMS: readonly Album[] = [
  {
    slug: 'achievement-icons',
    prefix: 'achievement-icons',
    title: 'Achievement icons',
    description: 'Badge icons for achievements.',
  },
  {
    slug: 'agent-cli-default-cats',
    prefix: 'agent-cli-default-cats',
    title: 'Agent CLI default cats',
    description: 'Default cat avatars for agent CLI sessions.',
  },
  {
    slug: 'anime-theme-backgrounds',
    prefix: 'anime-theme-backgrounds',
    title: 'Anime theme backgrounds',
    description: 'Background artwork for the anime theme set.',
  },
  {
    slug: 'cat-head-gallery',
    prefix: 'cat-head-gallery',
    title: 'Cat head gallery',
    description: 'Cat head portraits.',
  },
  {
    slug: 'document-subject-theme-previews',
    prefix: 'document-subject-theme-previews',
    title: 'Document subject theme previews',
    description: 'Preview images for document subject themes.',
  },
  {
    slug: 'hero-avatars',
    prefix: 'hero-avatars',
    title: 'Hero avatars',
    description: 'Avatar portraits for the hero section.',
  },
  {
    slug: 'preset-task-backgrounds',
    prefix: 'preset-task-backgrounds',
    title: 'Preset task backgrounds',
    description: 'Background images for preset tasks.',
  },
  {
    slug: 'prompt-scenario-covers',
    prefix: 'prompt-scenario-covers',
    title: 'Prompt scenario covers',
    description: 'Cover images for prompt scenarios.',
  },
  {
    slug: 'session-favicons',
    prefix: 'session-favicons',
    title: 'Session favicons',
    description: 'Favicon images for sessions.',
  },
  {
    slug: 'startup-splash',
    prefix: 'startup-splash',
    title: 'Startup splash',
    description: 'Images shown while the app starts.',
  },
  {
    slug: 'tier-rating-badges',
    prefix: 'tier-rating-badges',
    title: 'Tier rating badges',
    description: 'Badges for tier ratings.',
  },
  {
    slug: 'tokenmonitor-stage-illustrations',
    prefix: 'tokenmonitor-stage-illustrations',
    title: 'TokenMonitor stage illustrations',
    description: 'Stage illustrations for TokenMonitor.',
  },
];

// Throws when two albums share a slug or a prefix, naming the duplicate. Runs when this module loads, so a bad
// configuration fails the build before any request is sent.
export function assertUniqueAlbums(albums: readonly Album[]): void {
  const seenSlugs = new Set<string>();
  const seenPrefixes = new Set<string>();
  for (const album of albums) {
    if (seenSlugs.has(album.slug)) {
      throw new Error(`Duplicate album slug "${album.slug}" in ALBUMS`);
    }
    if (seenPrefixes.has(album.prefix)) {
      throw new Error(`Duplicate album prefix "${album.prefix}" in ALBUMS (album "${album.slug}")`);
    }
    seenSlugs.add(album.slug);
    seenPrefixes.add(album.prefix);
  }
}

assertUniqueAlbums(ALBUMS);
