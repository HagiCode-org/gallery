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
  'claude-antler-girl-gallery',
  'deepseek-whale-girl-gallery',
  'document-subject-theme-previews',
  'doubao-sunny-girl-gallery',
  'gemini-twin-star-girl-gallery',
  'gpt-knot-girl-gallery',
  'grok-punk-girl-gallery',
  'hero-avatars',
  'kimi-moon-girl-gallery',
  'planning-direction-icons',
  'preset-task-backgrounds',
  'prompt-scenario-covers',
  'qwen-porcelain-girl-gallery',
  'scenario-stage-backgrounds',
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
  it('lists the recipe-set prefixes in slug order', () => {
    assert.deepEqual(ALBUMS.map((album) => album.prefix), EXPECTED_PREFIXES);
  });

  it('has unique slugs and unique prefixes', () => {
    assert.equal(new Set(ALBUMS.map((album) => album.slug)).size, ALBUMS.length);
    assert.equal(new Set(ALBUMS.map((album) => album.prefix)).size, ALBUMS.length);
  });

  it('includes agent and model albums in the home page rotation', () => {
    assert.deepEqual(ALBUMS.filter((album) => album.featuredOnHome).map((album) => album.slug), [
      'agent-cli-default-cats',
      'claude-antler-girl-gallery',
      'deepseek-whale-girl-gallery',
      'doubao-sunny-girl-gallery',
      'gemini-twin-star-girl-gallery',
      'gpt-knot-girl-gallery',
      'grok-punk-girl-gallery',
      'kimi-moon-girl-gallery',
      'qwen-porcelain-girl-gallery',
    ]);
  });

  it('refuses a duplicate slug and names it', () => {
    assert.throws(
      () => assertUniqueAlbums([
        { slug: 'a', prefix: 'one' },
        { slug: 'a', prefix: 'two' },
      ]),
      /Duplicate album slug "a"/u,
    );
  });

  it('refuses a duplicate prefix and names it', () => {
    assert.throws(
      () => assertUniqueAlbums([
        { slug: 'a', prefix: 'same' },
        { slug: 'b', prefix: 'same' },
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
