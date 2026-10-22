// Search and social metadata derived from the album data. Pure: nothing here reads the Astro environment, so the
// Node tests import it directly. Every value comes from the album index or the album's translated text; nothing is invented.
import { SITE_NAME, SITE_URL, type Locale } from '../config/site.ts';
import { localePath } from '../i18n/locales.ts';
import { objectUrl } from './gallery/source.ts';
import type { GalleryIndex, IndexEntry } from './gallery/indexSchema.ts';

// How many images one album page lists in its structured data. The grid itself shows them all.
export const STRUCTURED_IMAGE_LIMIT = 24;

export type StructuredData = Record<string, unknown>;

// The alt text of one picture: its key in the album, then the album, the same words the grid link announces.
export function imageAlt(key: string, albumTitle: string): string {
  return `${key} – ${albumTitle}`;
}

// The meta description of an album page: the album's own description followed by how many images it holds.
export function albumMetaDescription(description: string, countText: string): string {
  return `${description} ${countText}`;
}

export function absoluteUrl(locale: Locale, path: string): string {
  return new URL(localePath(locale, path), SITE_URL).href;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
};

function encodingFormat(objectKey: string): string | undefined {
  return MIME_BY_EXTENSION[objectKey.split('.').pop()?.toLowerCase() ?? ''];
}

export function imageObject(entry: IndexEntry, albumTitle: string): StructuredData {
  return {
    '@type': 'ImageObject',
    contentUrl: objectUrl(entry.objectKey),
    name: imageAlt(entry.key, albumTitle),
    width: entry.width,
    height: entry.height,
    encodingFormat: encodingFormat(entry.objectKey),
  };
}

function websiteSchema(locale: Locale, description: string): StructuredData {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    description,
    inLanguage: locale,
  };
}

export interface HomeAlbumLink {
  readonly slug: string;
  readonly title: string;
}

// The home page: the site itself and the list of its albums.
export function homeStructuredData(locale: Locale, description: string, albums: readonly HomeAlbumLink[]): StructuredData[] {
  return [
    { '@context': 'https://schema.org', ...websiteSchema(locale, description) },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: albums.map((album, position) => ({
        '@type': 'ListItem',
        position: position + 1,
        name: album.title,
        url: absoluteUrl(locale, `/albums/${album.slug}/`),
      })),
    },
  ];
}

export interface AlbumStructuredInput {
  readonly locale: Locale;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly index: GalleryIndex;
  readonly homeLabel: string;
}

// An album page: a collection page with the first images as media, and the breadcrumb back to the home page.
export function albumStructuredData(input: AlbumStructuredInput): StructuredData[] {
  const { locale, slug, title, description, index, homeLabel } = input;
  const pageUrl = absoluteUrl(locale, `/albums/${slug}/`);
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': pageUrl,
      name: title,
      description,
      url: pageUrl,
      inLanguage: locale,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      associatedMedia: index.entries.slice(0, STRUCTURED_IMAGE_LIMIT).map((entry) => imageObject(entry, title)),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: homeLabel, item: absoluteUrl(locale, '/') },
        { '@type': 'ListItem', position: 2, name: title, item: pageUrl },
      ],
    },
  ];
}
