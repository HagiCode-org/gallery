// Single source for the site identity. The layout, the home page and Hagilight metadata read from here.
export const SITE_NAME = 'HagiCode Gallery';

export const SITE_DESCRIPTION = 'A gallery of HagiCode work, shared as static pages.';

// Production origin. Hagilight needs an absolute URL for the sitemap, robots.txt, RSS, llms.txt and metadata.
export const SITE_URL = 'https://gallery.hagicode.com';

// Mirrors the i18n block in astro.config.mjs; scripts/__tests__/config.test.mjs checks they match.
export const SUPPORTED_LOCALES = ['en-US'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en-US';
