import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveSiteLinks } from '@hagicode/hagilight-core/links';

import { ALBUMS } from '../../src/config/albums.ts';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../../src/config/site.ts';
import { ALBUM_TEXT, albumText } from '../../src/i18n/albums.ts';
import {
  LOCALE_LABELS,
  PREFIXED_LOCALES,
  formatCount,
  isLocale,
  localePath,
  ogLocale,
  splitLocalePath,
} from '../../src/i18n/locales.ts';
import { MESSAGES } from '../../src/i18n/messages/index.ts';
import { THEME_CHOICES, parseThemeChoice } from '../../src/lib/theme.ts';

const TEN = ['en-US', 'zh-CN', 'zh-Hant', 'ja-JP', 'ko-KR', 'de-DE', 'fr-FR', 'es-ES', 'pt-BR', 'ru-RU'];

describe('supported languages', () => {
  it('are the ten languages Hagilight ships, the default first', () => {
    assert.deepEqual([...SUPPORTED_LOCALES], TEN);
    assert.equal(SUPPORTED_LOCALES[0], DEFAULT_LOCALE);
  });

  it('are each recognised by the Hagilight footer, which resolves them to themselves', () => {
    for (const locale of SUPPORTED_LOCALES) {
      assert.equal(resolveSiteLinks(locale).locale, locale, `${locale} is not a Hagilight footer language`);
    }
  });

  it('have a native name and an English name for the language menu', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const label = LOCALE_LABELS[locale];
      assert.ok(label?.nativeName && label.name, `${locale} has no label`);
    }
    assert.equal(new Set(Object.values(LOCALE_LABELS).map((label) => label.nativeName)).size, TEN.length);
  });
});

describe('locale paths', () => {
  it('keeps the default language at the root and prefixes the others', () => {
    assert.equal(localePath('en-US', '/'), '/');
    assert.equal(localePath('en-US', '/albums/x/'), '/albums/x/');
    assert.equal(localePath('zh-Hant', '/'), '/zh-Hant/');
    assert.equal(localePath('ja-JP', '/albums/x/'), '/ja-JP/albums/x/');
    assert.equal(PREFIXED_LOCALES.length, TEN.length - 1);
  });

  it('splits a path back into its language and the locale-free rest', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const path of ['/', '/albums/hero-avatars/']) {
        assert.deepEqual(splitLocalePath(localePath(locale, path)), { locale, path });
      }
    }
    assert.deepEqual(splitLocalePath('/404.html'), { locale: 'en-US', path: '/404.html' });
    assert.deepEqual(splitLocalePath('/albums/en-US/'), { locale: 'en-US', path: '/albums/en-US/' });
    assert.equal(isLocale('xx-XX'), false);
  });

  it('spells Open Graph locales with an underscore', () => {
    assert.equal(ogLocale('en-US'), 'en_US');
    assert.equal(ogLocale('zh-Hant'), 'zh_TW');
  });
});

describe('message catalogs', () => {
  // Field-by-field parity with English (missing, extra and placeholder-mismatched keys) is `npm run i18n:audit`'s job, which
  // runs hagi18n over the YAML sources. These tests cover what it does not: that the catalogs the site imports exist and
  // that counts format with each language's plural forms.
  it('exist for every language and carry the four plural forms', () => {
    assert.deepEqual(Object.keys(MESSAGES).sort(), [...TEN].sort());
    for (const locale of TEN) {
      for (const group of ['images', 'albums']) {
        const forms = MESSAGES[locale][group];
        for (const form of ['one', 'few', 'many', 'other']) {
          assert.ok(forms[form]?.includes('{{n}}'), `${locale} ${group}.${form} must hold {{n}}`);
        }
      }
      assert.ok(MESSAGES[locale].viewer.bytes.includes('{{n}}'), `${locale} viewer.bytes must hold {{n}}`);
    }
  });

  it('counts with the plural forms of each language', () => {
    assert.equal(formatCount('en-US', MESSAGES['en-US'].images, 1), '1 image');
    assert.equal(formatCount('en-US', MESSAGES['en-US'].images, 1200), '1,200 images');
    assert.equal(formatCount('ja-JP', MESSAGES['ja-JP'].images, 3), '3 枚');
    assert.equal(formatCount('ru-RU', MESSAGES['ru-RU'].images, 1), '1 изображение');
    assert.equal(formatCount('ru-RU', MESSAGES['ru-RU'].images, 3), '3 изображения');
    assert.equal(formatCount('ru-RU', MESSAGES['ru-RU'].images, 5), '5 изображений');
    assert.equal(formatCount('de-DE', MESSAGES['de-DE'].albums, 2), '2 Alben');
  });
});

describe('album text', () => {
  it('has an entry for every configured album in every language, and for nothing else', () => {
    const slugs = ALBUMS.map((album) => album.slug).sort();
    for (const locale of SUPPORTED_LOCALES) {
      assert.deepEqual(Object.keys(ALBUM_TEXT[locale]).sort(), slugs, `${locale} albums.yml must list the configured albums`);
      for (const album of ALBUMS) {
        const text = ALBUM_TEXT[locale][album.slug];
        assert.ok(text.title && text.description, `${locale} has no text for album "${album.slug}"`);
      }
    }
  });

  it('falls back to English, then to the slug, so a page is never blank', () => {
    const album = ALBUMS[0];
    assert.deepEqual(albumText(album, 'ja-JP'), ALBUM_TEXT['ja-JP'][album.slug]);
    assert.deepEqual(albumText({ ...album, slug: 'not-translated-yet' }, 'ja-JP'), { title: 'not-translated-yet', description: '' });
  });
});

describe('theme choice', () => {
  it('offers system, light and dark', () => {
    assert.deepEqual([...THEME_CHOICES], ['system', 'light', 'dark']);
  });

  it('treats only an explicit light or dark as a choice', () => {
    assert.equal(parseThemeChoice('light'), 'light');
    assert.equal(parseThemeChoice('dark'), 'dark');
    for (const value of ['', null, undefined, 'auto', 'lunar-new-year', 'DARK']) {
      assert.equal(parseThemeChoice(value), 'system', String(value));
    }
  });
});
