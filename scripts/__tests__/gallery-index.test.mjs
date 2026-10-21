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
