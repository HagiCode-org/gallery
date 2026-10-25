import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAlbumLoader, coverFor, sheetCellGeometry, thumbnailFor } from '../../src/lib/gallery/albums.ts';
import { parseIndex } from '../../src/lib/gallery/indexSchema.ts';
import { fetchIndex, objectUrl } from '../../src/lib/gallery/source.ts';

const album = { slug: 'hero-avatars', prefix: 'hero-avatars', title: 'Hero avatars', description: 'Portraits.' };

// Mirrors the example in openspec/changes/r2-image-index-metadata/design.md (D3), with extra fields that must be ignored.
function validIndex(overrides = {}) {
  return {
    version: 1,
    set: 'hero-avatars',
    prefix: 'hero-avatars',
    updatedAt: '2026-10-20T10:00:00.000Z',
    range: { count: 1, first: 'anima-01', last: 'anima-01' },
    sheet: {
      file: 'sheet.avif',
      objectKey: 'hero-avatars/sheet.avif',
      bytes: 0,
      cell: 256,
      columns: 8,
      rows: 8,
      width: 2048,
      height: 2048,
    },
    entries: [
      {
        index: 0,
        key: 'anima-01',
        file: 'anima-01.avif',
        objectKey: 'hero-avatars/anima-01.avif',
        width: 1024,
        height: 1024,
        bytes: 11948,
        sheetCell: { column: 0, row: 0, x: 0, y: 0, width: 256, height: 256 },
        metadata: { file: 'anima-01.metadata.json', objectKey: 'hero-avatars/anima-01.metadata.json' },
        meta: {},
      },
    ],
    ...overrides,
  };
}

const plainEntry = (overrides = {}) => ({
  index: 0,
  key: 'anima-02',
  file: 'anima-02.avif',
  objectKey: 'hero-avatars/anima-02.avif',
  width: 1024,
  height: 1024,
  bytes: 12310,
  sheetCell: null,
  metadata: null,
  meta: { prompt: 'ignored' },
  ...overrides,
});

const withEntries = (entries) => validIndex({ range: { count: entries.length, first: entries[0]?.key ?? null, last: entries.at(-1)?.key ?? null }, entries });

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// The same valid index with every object key moved under another prefix.
const indexFor = (prefix) => JSON.parse(JSON.stringify(validIndex()).replaceAll('hero-avatars', prefix));

describe('parseIndex (task 1.3)', () => {
  it('accepts the valid example and keeps only the fields the gallery uses', () => {
    const parsed = parseIndex(validIndex(), album);
    assert.equal(parsed.version, 1);
    assert.deepEqual(parsed.range, { count: 1, first: 'anima-01', last: 'anima-01' });
    assert.equal(parsed.entries.length, 1);
    assert.deepEqual(Object.keys(parsed.entries[0]).sort(), [
      'bytes', 'height', 'key', 'metadata', 'objectKey', 'sheetCell', 'width',
    ]);
    assert.deepEqual(parsed.entries[0].sheetCell, { column: 0, row: 0, x: 0, y: 0, width: 256, height: 256 });
    assert.deepEqual(parsed.entries[0].metadata, { objectKey: 'hero-avatars/anima-01.metadata.json' });
  });

  it('refuses version 2 and names the album and the version', () => {
    assert.throws(() => parseIndex(validIndex({ version: 2 }), album), /Album "hero-avatars": version must be 1/u);
  });

  it('refuses a count that does not match the entries and names the album', () => {
    const index = validIndex({ range: { count: 60, first: 'anima-01', last: 'anima-60' } });
    assert.throws(() => parseIndex(index, album), /Album "hero-avatars": range\.count is 60 but entries lists 1/u);
  });

  it('refuses an object key outside the album prefix', () => {
    const index = withEntries([plainEntry({ objectKey: 'startup-splash/anima-02.avif' })]);
    assert.throws(() => parseIndex(index, album), /entries\[0\]\.objectKey must start with "hero-avatars\/"/u);
  });

  it('refuses full URLs, absolute paths and parent segments', () => {
    for (const objectKey of ['https://img-gen.hagicode.com/hero-avatars/anima-02.avif', '/hero-avatars/anima-02.avif', 'hero-avatars/../secret.avif']) {
      const index = withEntries([plainEntry({ objectKey })]);
      assert.throws(() => parseIndex(index, album), /Album "hero-avatars": entries\[0\]\.objectKey/u, objectKey);
    }
  });

  it('ignores unknown fields on entries and the index', () => {
    const index = withEntries([plainEntry({ extraField: 'x', meta: { deep: true } })]);
    const parsed = parseIndex({ ...index, unexpected: 1 }, album);
    assert.equal('extraField' in parsed.entries[0], false);
    assert.equal('meta' in parsed.entries[0], false);
  });

  it('accepts an empty batch with null first and last keys', () => {
    const parsed = parseIndex(
      validIndex({ range: { count: 0, first: null, last: null }, sheet: null, entries: [] }),
      album,
    );
    assert.deepEqual(parsed.entries, []);
    assert.deepEqual(parsed.range, { count: 0, first: null, last: null });
  });

  it('accepts a batch without a sheet, with every entry cell null', () => {
    const parsed = parseIndex({ ...withEntries([plainEntry()]), sheet: null }, album);
    assert.equal(parsed.sheet, null);
    assert.equal(parsed.entries[0].sheetCell, null);
  });

  it('accepts an entry with a sheet cell and metadata null', () => {
    const index = validIndex({
      entries: [
        validIndex().entries[0],
        plainEntry({ index: 1, key: 'anima-02', objectKey: 'hero-avatars/anima-02.avif', sheetCell: { column: 1, row: 2, x: 256, y: 512, width: 256, height: 256 } }),
      ],
      range: { count: 2, first: 'anima-01', last: 'anima-02' },
    });
    const parsed = parseIndex(index, album);
    assert.equal(parsed.entries[1].metadata, null);
    assert.deepEqual(parsed.entries[1].sheetCell, { column: 1, row: 2, x: 256, y: 512, width: 256, height: 256 });
  });

  it('refuses a sheet cell that lies outside the sheet', () => {
    const index = withEntries([plainEntry({ sheetCell: { column: 8, row: 0, x: 2048, y: 0, width: 256, height: 256 } })]);
    assert.throws(() => parseIndex({ ...index, sheet: validIndex().sheet }, album), /sheetCell\.column must be below 8/u);
  });

  it('refuses a sheet cell when the index has no sheet', () => {
    const index = withEntries([plainEntry({ sheetCell: { column: 0, row: 0, x: 0, y: 0, width: 256, height: 256 } })]);
    assert.throws(() => parseIndex({ ...index, sheet: null }, album), /sheetCell is set but the index has no sheet/u);
  });
});

describe('fetchIndex (task 1.4)', () => {
  const noDelay = { retryDelayMs: 0 };

  it('returns not-published for a 404 without retrying', async () => {
    let calls = 0;
    const result = await fetchIndex(album, {
      ...noDelay,
      fetch: async () => {
        calls += 1;
        return new Response('missing', { status: 404 });
      },
    });
    assert.deepEqual(result, { status: 'not-published' });
    assert.equal(calls, 1);
  });

  it('throws with the album name when every attempt returns 500', async () => {
    let calls = 0;
    await assert.rejects(
      fetchIndex(album, {
        ...noDelay,
        fetch: async () => {
          calls += 1;
          return new Response('boom', { status: 500 });
        },
      }),
      /Album "hero-avatars": index\.json could not be read after 3 attempts \(HTTP 500\)/u,
    );
    assert.equal(calls, 3);
  });

  it('throws with the album name when every attempt times out', async () => {
    await assert.rejects(
      fetchIndex(album, { ...noDelay, timeoutMs: 20, fetch: () => new Promise(() => {}) }),
      /Album "hero-avatars": .*timed out after 20 ms/u,
    );
  });

  it('returns the index when a retry succeeds after one failure', async () => {
    const responses = [new Response('boom', { status: 503 }), jsonResponse(validIndex())];
    let calls = 0;
    const result = await fetchIndex(album, {
      ...noDelay,
      fetch: async () => responses[calls++],
    });
    assert.equal(result.status, 'published');
    assert.equal(result.index.entries[0].key, 'anima-01');
    assert.equal(calls, 2);
  });

  it('builds the index URL from the base URL and the prefix', async () => {
    const urls = [];
    await fetchIndex(album, {
      ...noDelay,
      fetch: async (url) => {
        urls.push(url);
        return jsonResponse(validIndex());
      },
    });
    assert.deepEqual(urls, ['https://img-gen.hagicode.com/hero-avatars/index.json']);
  });

  it('does not retry a body that fails validation', async () => {
    let calls = 0;
    await assert.rejects(
      fetchIndex(album, {
        ...noDelay,
        fetch: async () => {
          calls += 1;
          return jsonResponse(validIndex({ version: 2 }));
        },
      }),
      /version must be 1/u,
    );
    assert.equal(calls, 1);
  });
});

describe('album loading and geometry (task 1.5)', () => {
  const twoAlbums = [album, { slug: 'startup-splash', prefix: 'startup-splash', title: 'Startup', description: '' }];

  it('requests each album index once across two calls', async () => {
    const requested = [];
    const load = createAlbumLoader({
      albums: twoAlbums,
      source: {
        retryDelayMs: 0,
        fetch: async (url) => {
          requested.push(url);
          return jsonResponse(indexFor(url.includes('startup-splash') ? 'startup-splash' : 'hero-avatars'));
        },
      },
    });
    const first = await load();
    const second = await load();
    assert.equal(first, second);
    assert.equal(first.length, 2);
    assert.equal(requested.length, 2);
  });

  it('warns once for an album that is not published and keeps the others in configuration order', async () => {
    const warnings = [];
    const load = createAlbumLoader({
      albums: twoAlbums,
      warn: (message) => warnings.push(message),
      source: {
        retryDelayMs: 0,
        fetch: async (url) => (url.includes('startup-splash') ? new Response('', { status: 404 }) : jsonResponse(indexFor('hero-avatars'))),
      },
    });
    const loaded = await load();
    assert.deepEqual(loaded.map((item) => item.album.slug), ['hero-avatars']);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /album "startup-splash" is not published yet/u);
  });

  it('keeps an unpublished album that is listed before publish, with an empty index, and warns once', async () => {
    const warnings = [];
    const load = createAlbumLoader({
      albums: [album, { slug: 'kimi-moon-girl-gallery', prefix: 'kimi-moon-girl-gallery', listBeforePublish: true }],
      warn: (message) => warnings.push(message),
      source: {
        retryDelayMs: 0,
        fetch: async (url) => (url.includes('kimi-moon') ? new Response('', { status: 404 }) : jsonResponse(indexFor('hero-avatars'))),
      },
    });
    const loaded = await load();
    assert.deepEqual(loaded.map((item) => item.album.slug), ['hero-avatars', 'kimi-moon-girl-gallery']);
    assert.equal(loaded[1].index.range.count, 0);
    assert.deepEqual(loaded[1].index.entries, []);
    assert.equal(coverFor(loaded[1]), null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /album "kimi-moon-girl-gallery" is not published yet .* listed with no images/u);
  });

  it('uses the published index once a listed-before-publish album is published', async () => {
    const load = createAlbumLoader({
      albums: [{ ...album, listBeforePublish: true }],
      source: { retryDelayMs: 0, fetch: async () => jsonResponse(indexFor('hero-avatars')) },
    });
    const [loaded] = await load();
    assert.ok(loaded.index.range.count > 0);
  });

  it('returns an empty list, without throwing, when every album is missing', async () => {
    const load = createAlbumLoader({
      albums: twoAlbums,
      source: { retryDelayMs: 0, fetch: async () => new Response('', { status: 404 }) },
    });
    assert.deepEqual(await load(), []);
  });

  it('gives cell column 1 row 2 of a 4-column sheet the expected percentage position', () => {
    const geometry = sheetCellGeometry({ columns: 4, rows: 4 }, { column: 1, row: 2 });
    assert.deepEqual(geometry, { size: '400% 400%', position: '33.3333% 66.6667%' });
  });

  it('places the first and last cells at the edges', () => {
    assert.deepEqual(sheetCellGeometry({ columns: 8, rows: 8 }, { column: 0, row: 0 }), { size: '800% 800%', position: '0% 0%' });
    assert.deepEqual(sheetCellGeometry({ columns: 8, rows: 8 }, { column: 7, row: 7 }), { size: '800% 800%', position: '100% 100%' });
  });

  it('uses the first entry cell for the cover when the sheet has one, otherwise the first image', () => {
    const withSheet = parseIndex(validIndex(), album);
    assert.equal(coverFor({ album, index: withSheet }).kind, 'sheet');
    assert.equal(coverFor({ album, index: parseIndex({ ...validIndex(), sheet: null, entries: [{ ...validIndex().entries[0], sheetCell: null }] }, album) }).kind, 'image');
    assert.equal(coverFor({ album, index: parseIndex(validIndex({ range: { count: 0, first: null, last: null }, sheet: null, entries: [] }), album) }), null);
  });

  it('gives an entry without a cell its own image when the index has a sheet', () => {
    const index = parseIndex(withEntries([plainEntry()]), album);
    assert.deepEqual(thumbnailFor(index, index.entries[0]), {
      kind: 'image',
      url: objectUrl('hero-avatars/anima-02.avif'),
      bytes: 12310,
      width: 1024,
      height: 1024,
    });
  });
});

describe('home page and album page helpers', async () => {
  const { dominantAspect, stackFor, backgroundStyle, sheetStyle } = await import('../../src/lib/gallery/albums.ts');

  const entry = (key, width, height) => ({
    key,
    objectKey: `hero-avatars/${key}.avif`,
    width,
    height,
    bytes: 10,
    sheetCell: null,
    metadata: null,
  });
  const index = (entries) => ({ version: 1, range: { count: entries.length, first: null, last: null }, sheet: null, entries });

  it('reports the most common shape of an album', () => {
    assert.equal(dominantAspect(index([entry('a', 1232, 704), entry('b', 1232, 704), entry('c', 1024, 1024)])), '1232 / 704');
  });

  it('breaks a tie towards the earlier entry and falls back to a square', () => {
    assert.equal(dominantAspect(index([entry('a', 10, 20), entry('b', 20, 10)])), '10 / 20');
    assert.equal(dominantAspect(index([])), '1 / 1');
  });

  it('spreads the stack through the album, cover first', () => {
    const entries = Array.from({ length: 9 }, (_, step) => entry(`e${step}`, 1024, 1024));
    const stack = stackFor({ album, index: index(entries) });
    assert.deepEqual(
      stack.map((item) => item.url.split('/').pop()),
      ['e0.avif', 'e3.avif', 'e6.avif'],
    );
  });

  it('shows fewer pictures for a small album and none for an empty one', () => {
    assert.equal(stackFor({ album, index: index([entry('a', 1, 1)]) }).length, 1);
    assert.equal(stackFor({ album, index: index([]) }).length, 0);
  });

  it('writes a background for each thumbnail kind', () => {
    const image = { kind: 'image', url: 'https://img.example/a.avif', bytes: 1, width: 1, height: 1 };
    const sheet = { kind: 'sheet', url: 'https://img.example/s.avif', bytes: 1, size: '200% 200%', position: '100% 0%' };
    assert.equal(sheetStyle(image), '');
    assert.match(sheetStyle(sheet), /background-size: 200% 200%; background-position: 100% 0%;/u);
    assert.match(backgroundStyle(image), /url\("https:\/\/img\.example\/a\.avif"\); background-size: cover;/u);
    assert.equal(backgroundStyle(sheet), sheetStyle(sheet));
  });
});
