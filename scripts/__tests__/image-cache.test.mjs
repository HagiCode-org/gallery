import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BYTES_HEADER,
  CACHE_PREFIX,
  IMAGE_CACHE_NAME,
  METADATA_CACHE_NAME,
  pruneOldCaches,
  readCached,
  storeCached,
} from '../../src/lib/image-cache/cache.ts';
import { loadMetadata, parseMetadata } from '../../src/lib/image-cache/metadata.ts';

const URL_ONE = 'https://img-gen.hagicode.com/hero-avatars/anima-01.avif';
const META_URL = 'https://img-gen.hagicode.com/hero-avatars/anima-01.metadata.json';

// An in-memory Cache API: a map of cache name to a map of request URL to the stored Response.
function fakeStorage(seed = {}) {
  const caches = new Map(Object.entries(seed).map(([name, entries]) => [name, new Map(Object.entries(entries))]));
  const storage = {
    async open(name) {
      if (!caches.has(name)) caches.set(name, new Map());
      const store = caches.get(name);
      return {
        async match(url) {
          const stored = store.get(url);
          return stored ? stored.clone() : undefined;
        },
        async put(url, response) {
          store.set(url, response);
        },
      };
    },
    async keys() {
      return [...caches.keys()];
    },
    async delete(name) {
      return caches.delete(name);
    },
  };
  return { storage, caches };
}

const stored = (text, bytes = text.length) =>
  new Response(text, { headers: { [BYTES_HEADER]: String(bytes), 'content-type': 'image/avif' } });

const metadataBody = (overrides = {}) =>
  JSON.stringify({
    version: 1,
    set: 'hero-avatars',
    key: 'anima-01',
    file: 'anima-01.avif',
    objectKey: 'hero-avatars/anima-01.avif',
    prompt: { positive: 'a cat', negative: 'blur' },
    seed: 7,
    width: 1024,
    height: 1024,
    bytes: 11948,
    generatedAt: '2026-10-19T08:13:00.000Z',
    meta: {},
    ...overrides,
  });

const jsonFetch = (body, status = 200) => async () => new Response(body, { status });

describe('image cache (task 3.1)', () => {
  it('returns a stored copy whose size matches, within the budget', async () => {
    const { storage } = fakeStorage({ [IMAGE_CACHE_NAME]: { [URL_ONE]: stored('abcd', 4) } });
    const blob = await readCached(URL_ONE, 4, { storage });
    assert.equal(blob?.size, 4);
  });

  it('treats a read that is slower than the budget as a miss', async () => {
    const slow = {
      async open() {
        return {
          match: () => new Promise((resolve) => setTimeout(() => resolve(stored('abcd', 4)), 1000)),
          put: async () => {},
        };
      },
      keys: async () => [],
      delete: async () => false,
    };
    const started = Date.now();
    assert.equal(await readCached(URL_ONE, 4, { storage: slow }), null);
    assert.ok(Date.now() - started < 500, 'the read must give up near the 150 ms budget');
  });

  it('treats a thrown read as a miss', async () => {
    const broken = {
      async open() {
        return { match: async () => { throw new Error('boom'); }, put: async () => {} };
      },
      keys: async () => [],
      delete: async () => false,
    };
    assert.equal(await readCached(URL_ONE, 4, { storage: broken }), null);
  });

  it('treats an absent Cache API as a miss', async () => {
    assert.equal(await readCached(URL_ONE, 4, { storage: undefined }), null);
  });

  it('treats a stored size that differs from the index as a miss', async () => {
    const { storage } = fakeStorage({ [IMAGE_CACHE_NAME]: { [URL_ONE]: stored('abcde', 5) } });
    assert.equal(await readCached(URL_ONE, 4, { storage }), null);
  });

  it('leaves the existing entry when the download fails', async () => {
    const { storage, caches } = fakeStorage({ [IMAGE_CACHE_NAME]: { [URL_ONE]: stored('abcd', 4) } });
    const written = await storeCached(URL_ONE, 4, { storage, fetch: jsonFetch('nope', 500) });
    assert.equal(written, false);
    assert.equal(caches.get(IMAGE_CACHE_NAME).get(URL_ONE).headers.get(BYTES_HEADER), '4');
  });

  it('stores a successful download under its URL with the index byte size', async () => {
    const { storage, caches } = fakeStorage();
    const written = await storeCached(URL_ONE, 4, { storage, fetch: async () => new Response('abcd') });
    assert.equal(written, true);
    const entry = caches.get(IMAGE_CACHE_NAME).get(URL_ONE);
    assert.equal(entry.headers.get(BYTES_HEADER), '4');
    assert.equal(await entry.text(), 'abcd');
  });

  it('does not store a download whose size differs from the index', async () => {
    const { storage, caches } = fakeStorage();
    assert.equal(await storeCached(URL_ONE, 4, { storage, fetch: async () => new Response('abcdef') }), false);
    assert.equal(caches.get(IMAGE_CACHE_NAME)?.has(URL_ONE) ?? false, false);
  });

  it('swallows a quota error and reports that nothing was stored', async () => {
    const full = {
      async open() {
        return {
          match: async () => undefined,
          put: async () => {
            throw new Error('QuotaExceededError');
          },
        };
      },
      keys: async () => [],
      delete: async () => false,
    };
    assert.equal(await storeCached(URL_ONE, 4, { storage: full, fetch: async () => new Response('abcd') }), false);
  });

  it('sends the download without credentials, past the HTTP cache, and with no custom header', async () => {
    const seen = [];
    const { storage } = fakeStorage();
    await storeCached(URL_ONE, 4, {
      storage,
      fetch: async (url, init) => {
        seen.push({ url, init });
        return new Response('abcd');
      },
    });
    assert.deepEqual(seen, [{ url: URL_ONE, init: { credentials: 'omit', cache: 'reload' } }]);
  });

  it('keys each entry by the full public URL', async () => {
    const { storage, caches } = fakeStorage();
    await storeCached(URL_ONE, 4, { storage, fetch: async () => new Response('abcd') });
    assert.deepEqual([...caches.get(IMAGE_CACHE_NAME).keys()], [URL_ONE]);
  });

  it('deletes an older version of a gallery cache and keeps the current one', async () => {
    const { storage, caches } = fakeStorage({
      [`${CACHE_PREFIX}images-v0`]: {},
      [IMAGE_CACHE_NAME]: {},
      [METADATA_CACHE_NAME]: {},
    });
    const deleted = await pruneOldCaches({ storage });
    assert.deepEqual(deleted, [`${CACHE_PREFIX}images-v0`]);
    assert.deepEqual([...caches.keys()].sort(), [IMAGE_CACHE_NAME, METADATA_CACHE_NAME].sort());
  });

  it('keeps caches that belong to other applications on the origin', async () => {
    const { storage, caches } = fakeStorage({ 'workbox-precache-v2': {}, [IMAGE_CACHE_NAME]: {} });
    assert.deepEqual(await pruneOldCaches({ storage }), []);
    assert.ok(caches.has('workbox-precache-v2'));
  });

  it('never rejects when the storage fails during pruning', async () => {
    const failing = {
      open: async () => ({}),
      keys: async () => {
        throw new Error('no storage');
      },
      delete: async () => false,
    };
    assert.deepEqual(await pruneOldCaches({ storage: failing }), []);
  });
});

describe('metadata (task 3.2)', () => {
  it('parses version 1 metadata and accepts a null generation time', () => {
    const parsed = parseMetadata(JSON.parse(metadataBody({ generatedAt: null })));
    assert.equal(parsed.generatedAt, null);
    assert.deepEqual(parsed.prompt, { positive: 'a cat', negative: 'blur' });
    assert.equal(parsed.seed, 7);
  });

  it('refuses a body that is not version 1', () => {
    assert.throws(() => parseMetadata({ version: 2, prompt: {}, seed: 1, generatedAt: null }), /version/u);
  });

  it('returns the cached copy without waiting for the network', async () => {
    const { storage } = fakeStorage({ [METADATA_CACHE_NAME]: { [META_URL]: new Response(metadataBody()) } });
    const started = Date.now();
    const result = await loadMetadata(META_URL, {
      storage,
      fetch: () => new Promise(() => {}),
    });
    assert.equal(result.status, 'ready');
    assert.equal(result.metadata.prompt.positive, 'a cat');
    assert.ok(Date.now() - started < 500);
  });

  it('replaces the cached copy with a valid, different background refresh', async () => {
    const { storage, caches } = fakeStorage({ [METADATA_CACHE_NAME]: { [META_URL]: new Response(metadataBody()) } });
    const result = await loadMetadata(META_URL, {
      storage,
      fetch: jsonFetch(metadataBody({ prompt: { positive: 'a dog', negative: '' } })),
    });
    const refreshed = await result.refresh;
    assert.equal(refreshed.prompt.positive, 'a dog');
    const kept = await caches.get(METADATA_CACHE_NAME).get(META_URL).text();
    assert.match(kept, /a dog/u);
  });

  it('keeps the cached copy when the background refresh fails', async () => {
    const { storage, caches } = fakeStorage({ [METADATA_CACHE_NAME]: { [META_URL]: new Response(metadataBody()) } });
    const result = await loadMetadata(META_URL, { storage, fetch: jsonFetch('nope', 500) });
    assert.equal(result.status, 'ready');
    assert.equal(await result.refresh, null);
    assert.match(await caches.get(METADATA_CACHE_NAME).get(META_URL).text(), /a cat/u);
  });

  it('keeps the cached copy when the background refresh returns an invalid body', async () => {
    const { storage, caches } = fakeStorage({ [METADATA_CACHE_NAME]: { [META_URL]: new Response(metadataBody()) } });
    const result = await loadMetadata(META_URL, { storage, fetch: jsonFetch(metadataBody({ version: 2 })) });
    assert.equal(await result.refresh, null);
    assert.match(await caches.get(METADATA_CACHE_NAME).get(META_URL).text(), /a cat/u);
  });

  it('reports a failed result when there is no cache and the network fails', async () => {
    const { storage } = fakeStorage();
    const result = await loadMetadata(META_URL, { storage, fetch: jsonFetch('missing', 404) });
    assert.equal(result.status, 'failed');
  });

  it('reports a failed result without a cache and without a usable network', async () => {
    const result = await loadMetadata(META_URL, {
      storage: undefined,
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    assert.equal(result.status, 'failed');
  });

  it('fetches from the network and stores the copy when nothing is cached', async () => {
    const { storage, caches } = fakeStorage();
    const result = await loadMetadata(META_URL, { storage, fetch: jsonFetch(metadataBody()) });
    assert.equal(result.status, 'ready');
    assert.equal(result.metadata.seed, 7);
    assert.match(await caches.get(METADATA_CACHE_NAME).get(META_URL).text(), /a cat/u);
  });
});
