import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { DEFAULT_LOCALE, SITE_URL, SUPPORTED_LOCALES } from '../../src/config/site.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('site identity', () => {
  it('lists the default locale among the supported locales', () => {
    assert.ok(SUPPORTED_LOCALES.includes(DEFAULT_LOCALE), `${DEFAULT_LOCALE} must be in ${SUPPORTED_LOCALES.join(', ')}`);
  });

  it('uses an absolute HTTPS origin with no path, query or fragment', () => {
    const url = new URL(SITE_URL);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.pathname, '/');
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.equal(SITE_URL, url.origin, 'SITE_URL must not end with a trailing slash or path');
  });
});

describe('Astro configuration', () => {
  it('declares the production origin, the root base and the default locale from site.ts', async () => {
    const config = (await import(path.join(root, 'astro.config.mjs'))).default;
    assert.equal(config.site, SITE_URL);
    assert.equal(config.base, '/');
    assert.equal(config.i18n.defaultLocale, DEFAULT_LOCALE);
    assert.equal(config.i18n.routing.prefixDefaultLocale, false);
  });

  it('keeps prefixDefaultLocale off, so English stays at the root and the other nine take /<locale>/', async () => {
    const config = (await import(path.join(root, 'astro.config.mjs'))).default;
    assert.equal(config.i18n.routing.prefixDefaultLocale, false);
    assert.equal(config.i18n.locales.length, 10);
  });

  it('keeps the i18n locale list equal to SUPPORTED_LOCALES', async () => {
    const config = (await import(path.join(root, 'astro.config.mjs'))).default;
    assert.deepEqual(config.i18n.locales, [...SUPPORTED_LOCALES]);
  });

  it('registers Hagilight, the shared favicon and React', async () => {
    const config = (await import(path.join(root, 'astro.config.mjs'))).default;
    const names = config.integrations.map((integration) => integration?.name);
    assert.ok(names.includes('@hagicode/hagilight:discovery'), `missing Hagilight discovery integration in ${names.join(', ')}`);
    assert.ok(names.includes('@hagicode/hagilight:favicon'), `missing Hagilight favicon integration in ${names.join(', ')}`);
    assert.ok(names.includes('@astrojs/react'), `missing @astrojs/react in ${names.join(', ')}`);
  });

  it('wires the @ alias to src', async () => {
    const config = (await import(path.join(root, 'astro.config.mjs'))).default;
    const alias = config.vite.resolve.alias['@'];
    assert.equal(alias, path.join(root, 'src'));
  });
});
