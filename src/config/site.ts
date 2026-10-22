// Single source for the site identity. The layout, the home page and Hagilight metadata read from here.
export const SITE_NAME = 'HagiCode Gallery';

export const SITE_DESCRIPTION = "Browse images from HagiCode's img-gen pipeline. Every image shows its prompts, seed and generation details.";

// Production origin. Hagilight needs an absolute URL for the sitemap, robots.txt, RSS, llms.txt and metadata.
export const SITE_URL = 'https://gallery.hagicode.com';

// The ten languages Hagilight's footer ships. Mirrors the i18n block in astro.config.mjs; scripts/__tests__/config.test.mjs
// checks they match. The order is the order of the language menu.
export const SUPPORTED_LOCALES = [
  'en-US',
  'zh-CN',
  'zh-Hant',
  'ja-JP',
  'ko-KR',
  'de-DE',
  'fr-FR',
  'es-ES',
  'pt-BR',
  'ru-RU',
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en-US';
