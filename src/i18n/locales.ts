// Locale helpers shared by the build (pages, layout) and the tests. Pure: nothing here reads the Astro environment.
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '../config/site.ts';

export interface LocaleLabel {
  // The language's name in itself, shown in the language menu.
  readonly nativeName: string;
  // The language's name in English, for the accessible description of the menu entry.
  readonly name: string;
}

export const LOCALE_LABELS: Record<Locale, LocaleLabel> = {
  'en-US': { nativeName: 'English', name: 'English' },
  'zh-CN': { nativeName: '简体中文', name: 'Simplified Chinese' },
  'zh-Hant': { nativeName: '繁體中文', name: 'Traditional Chinese' },
  'ja-JP': { nativeName: '日本語', name: 'Japanese' },
  'ko-KR': { nativeName: '한국어', name: 'Korean' },
  'de-DE': { nativeName: 'Deutsch', name: 'German' },
  'fr-FR': { nativeName: 'Français', name: 'French' },
  'es-ES': { nativeName: 'Español', name: 'Spanish' },
  'pt-BR': { nativeName: 'Português (Brasil)', name: 'Portuguese (Brazil)' },
  'ru-RU': { nativeName: 'Русский', name: 'Russian' },
};

// Locales that get a /<locale>/ prefix. The default locale lives at the site root (routing.prefixDefaultLocale: false).
export const PREFIXED_LOCALES: readonly Locale[] = SUPPORTED_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

// `path` is a locale-free site path that starts with a slash, such as "/" or "/albums/some-album/". The site is served
// from the root (astro.config.mjs sets base: '/'), so the result is a root-relative URL.
export function localePath(locale: Locale, path: string): string {
  return locale === DEFAULT_LOCALE ? path : `/${locale}${path === '/' ? '/' : path}`;
}

// Splits a URL path into the locale it carries and the locale-free rest. A path with no locale prefix is the default
// locale's.
export function splitLocalePath(pathname: string): { locale: Locale; path: string } {
  const [, first = '', ...rest] = pathname.split('/');
  if (isLocale(first) && first !== DEFAULT_LOCALE) {
    return { locale: first, path: `/${rest.join('/')}` };
  }
  return { locale: DEFAULT_LOCALE, path: pathname };
}

// "1 image" / "2 images": picks the CLDR plural form for the locale and fills {{n}}. Every catalog defines all four forms
// (one, few, many, other); a language that does not tell them apart repeats the same text.
export interface PluralForms {
  readonly one: string;
  readonly few: string;
  readonly many: string;
  readonly other: string;
}

export function formatCount(locale: Locale, forms: PluralForms, count: number): string {
  const category = new Intl.PluralRules(locale).select(count);
  const template = forms[category as keyof PluralForms] ?? forms.other;
  return template.replace('{{n}}', count.toLocaleString(locale));
}

// The Open Graph spelling of a locale: en-US is en_US, and Traditional Chinese is zh_TW.
export function ogLocale(locale: Locale): string {
  return locale === 'zh-Hant' ? 'zh_TW' : locale.replace('-', '_');
}
