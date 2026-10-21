import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ALBUMS, IMAGE_BASE_URL, assertUniqueAlbums } from '../../src/config/albums.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG_FILE = path.join(root, 'src', 'config', 'albums.ts');

const EXPECTED_PREFIXES = [
  'achievement-icons',
  'agent-cli-default-cats',
  'anime-theme-backgrounds',
  'cat-head-gallery',
  'document-subject-theme-previews',
  'hero-avatars',
  'preset-task-backgrounds',
  'prompt-scenario-covers',
  'session-favicons',
  'startup-splash',
  'tier-rating-badges',
  'tokenmonitor-stage-illustrations',
];

// Every file under src/, as absolute paths.
async function sourceFiles(dir = path.join(root, 'src')) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : [full];
  }));
  return nested.flat();
}

describe('album configuration (task 1.2)', () => {
  it('lists the twelve recipe-set prefixes in the design order', () => {
    assert.deepEqual(ALBUMS.map((album) => album.prefix), EXPECTED_PREFIXES);
  });

  it('has unique slugs and unique prefixes', () => {
    assert.equal(new Set(ALBUMS.map((album) => album.slug)).size, ALBUMS.length);
    assert.equal(new Set(ALBUMS.map((album) => album.prefix)).size, ALBUMS.length);
  });

  it('gives every album a title and a description', () => {
    for (const album of ALBUMS) {
      assert.ok(album.title.trim().length > 0, `${album.slug} needs a title`);
      assert.ok(album.description.trim().length > 0, `${album.slug} needs a description`);
    }
  });

  it('refuses a duplicate slug and names it', () => {
    assert.throws(
      () => assertUniqueAlbums([
        { slug: 'a', prefix: 'one', title: 'A', description: '' },
        { slug: 'a', prefix: 'two', title: 'B', description: '' },
      ]),
      /Duplicate album slug "a"/u,
    );
  });

  it('refuses a duplicate prefix and names it', () => {
    assert.throws(
      () => assertUniqueAlbums([
        { slug: 'a', prefix: 'same', title: 'A', description: '' },
        { slug: 'b', prefix: 'same', title: 'B', description: '' },
      ]),
      /Duplicate album prefix "same" in ALBUMS \(album "b"\)/u,
    );
  });

  it('defines the base URL and the prefixes only in the albums configuration', async () => {
    const offenders = [];
    const files = (await sourceFiles()).filter((file) => file !== CONFIG_FILE && /\.(?:ts|tsx|astro|mjs|js|css)$/u.test(file));
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      const relativePath = path.relative(root, file);
      if (text.includes(IMAGE_BASE_URL)) offenders.push(`${relativePath} repeats the base URL`);
      for (const prefix of EXPECTED_PREFIXES) {
        if (text.includes(`'${prefix}'`) || text.includes(`"${prefix}"`) || text.includes(`${prefix}/`)) {
          offenders.push(`${relativePath} repeats the prefix "${prefix}"`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});
