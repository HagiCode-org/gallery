// Albums published to img-gen.hagicode.com. Each album is one R2 prefix; the build reads its index.json. The names and
// descriptions shown to visitors are not here: they live per language in src/i18n/locales/<locale>/albums.yml, keyed by slug.
//
// Task 1.1 probe, `Origin: https://gallery.hagicode.com`:
// - 2026-10-21, before the Cloudflare CORS rule `https://*.hagicode.com`: no Access-Control-Allow-Origin on the
//   objects, an OPTIONS preflight returned 403, so fetch() from this origin was refused. Cache API writes failed
//   silently and metadata could not be read. Plain <img> and CSS background loads were not affected.
// - 2026-10-21, after the rule: the preflight returns 204 with Access-Control-Allow-Origin for the gallery origin, and
//   fresh image and metadata responses carry it. A foreign origin gets no header. An object cached at the edge before
//   the rule can keep answering without the header until it expires (max-age 86400), so purge it if it matters.
// Re-run this probe when the R2 CORS rule changes.

export const IMAGE_BASE_URL = 'https://img-gen.hagicode.com';

export interface Album {
  // URL segment under /albums/. Unique across ALBUMS.
  readonly slug: string;
  // R2 prefix, the batch's output.publish.prefix. Unique across ALBUMS.
  readonly prefix: string;
  // List the album before img-gen has published its index. It then shows with no images and a "coming soon" note, and
  // fills in on the first build after the publish. Remove the flag once the album is published.
  readonly listBeforePublish?: true;
}

export const ALBUMS: readonly Album[] = [
  {
    slug: 'achievement-icons',
    prefix: 'achievement-icons',
  },
  {
    slug: 'agent-cli-default-cats',
    prefix: 'agent-cli-default-cats',
  },
  {
    slug: 'anime-theme-backgrounds',
    prefix: 'anime-theme-backgrounds',
  },
  {
    slug: 'cat-head-gallery',
    prefix: 'cat-head-gallery',
  },
  {
    slug: 'claude-antler-girl-gallery',
    prefix: 'claude-antler-girl-gallery',
    listBeforePublish: true,
  },
  {
    slug: 'deepseek-whale-girl-gallery',
    prefix: 'deepseek-whale-girl-gallery',
  },
  {
    slug: 'document-subject-theme-previews',
    prefix: 'document-subject-theme-previews',
  },
  {
    slug: 'doubao-sunny-girl-gallery',
    prefix: 'doubao-sunny-girl-gallery',
    listBeforePublish: true,
  },
  {
    slug: 'gemini-twin-star-girl-gallery',
    prefix: 'gemini-twin-star-girl-gallery',
    listBeforePublish: true,
  },
  {
    slug: 'gpt-knot-girl-gallery',
    prefix: 'gpt-knot-girl-gallery',
    listBeforePublish: true,
  },
  {
    slug: 'grok-punk-girl-gallery',
    prefix: 'grok-punk-girl-gallery',
    listBeforePublish: true,
  },
  {
    slug: 'hero-avatars',
    prefix: 'hero-avatars',
  },
  {
    slug: 'kimi-moon-girl-gallery',
    prefix: 'kimi-moon-girl-gallery',
    listBeforePublish: true,
  },
  {
    slug: 'planning-direction-icons',
    prefix: 'planning-direction-icons',
  },
  {
    slug: 'preset-task-backgrounds',
    prefix: 'preset-task-backgrounds',
  },
  {
    slug: 'prompt-scenario-covers',
    prefix: 'prompt-scenario-covers',
  },
  {
    slug: 'qwen-porcelain-girl-gallery',
    prefix: 'qwen-porcelain-girl-gallery',
    listBeforePublish: true,
  },
  {
    slug: 'scenario-stage-backgrounds',
    prefix: 'scenario-stage-backgrounds',
  },
  {
    slug: 'session-favicons',
    prefix: 'session-favicons',
  },
  {
    slug: 'startup-splash',
    prefix: 'startup-splash',
  },
  {
    slug: 'tier-rating-badges',
    prefix: 'tier-rating-badges',
  },
  {
    slug: 'tokenmonitor-stage-illustrations',
    prefix: 'tokenmonitor-stage-illustrations',
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
