import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { orderHomeAlbums, samplePictures } from '../../src/lib/gallery/home.ts';

const album = (slug, featured, count = 3) => ({
  slug,
  featured,
  thumbnails: Array.from({ length: count }, (_, index) => ({ kind: 'image', url: `${slug}/${index}.avif` })),
});

describe('home album rotation', () => {
  const albums = [
    album('ordinary', false),
    album('agent', true),
    album('unpublished-model', true, 0),
    album('model-a', true),
    album('other', false),
    album('model-b', true),
  ];

  it('lets every published agent/model lead and keeps other albums in their relative order', () => {
    const leads = new Set();
    for (const random of [0, 0.4, 0.99]) {
      const ordered = orderHomeAlbums(albums, null, () => random);
      leads.add(ordered[0].slug);
      assert.deepEqual(ordered.slice(3).map(({ slug }) => slug), ['ordinary', 'unpublished-model', 'other']);
      assert.equal(new Set(ordered).size, albums.length);
    }
    assert.deepEqual([...leads], ['agent', 'model-a', 'model-b']);
    assert.equal(albums[0].slug, 'ordinary');
  });

  it('does not repeat the previous lead when another eligible album exists', () => {
    for (const previous of ['agent', 'model-a', 'model-b', 'removed-model']) {
      for (const random of [0, 0.4, 0.99]) {
        const first = orderHomeAlbums(albums, previous, () => random)[0];
        assert.notEqual(first.slug, previous);
        assert.ok(first.featured && first.thumbnails.length > 0);
      }
    }
  });

  it('handles one, no, and not-yet-published featured albums', () => {
    const single = [album('ordinary', false), album('agent', true)];
    assert.equal(orderHomeAlbums(single, 'agent')[0].slug, 'agent');
    const none = [album('ordinary', false), album('pending', true, 0)];
    assert.deepEqual(orderHomeAlbums(none), none);
    assert.deepEqual(orderHomeAlbums([]), []);
  });
});

describe('home picture sampling', () => {
  it('can select every picture as the cover, including the last one', () => {
    const pictures = ['first', 'middle', 'last'];
    const covers = [0, 0.5, 0.99].map((random) => samplePictures(pictures, 1, () => random)[0]);
    assert.deepEqual(covers, pictures);
    assert.deepEqual(pictures, ['first', 'middle', 'last']);
  });

  it('samples a stack without duplicates, including for a short or empty album', () => {
    assert.deepEqual(samplePictures(['a', 'b', 'c', 'd'], 3, () => 0.99), ['d', 'a', 'b']);
    assert.deepEqual(samplePictures(['a', 'b'], 5, () => 0), ['a', 'b']);
    assert.deepEqual(samplePictures(['a'], 3), ['a']);
    assert.deepEqual(samplePictures([], 3), []);
    assert.deepEqual(samplePictures(['a'], 0), []);
  });

  it('keeps a sampled thumbnail intact for both sprite sheets and individual images', () => {
    const image = { kind: 'image', url: 'image.avif', bytes: 10, width: 100, height: 200 };
    const sheet = { kind: 'sheet', url: 'sheet.avif', bytes: 20, size: '200% 200%', position: '100% 0%' };
    assert.deepEqual(samplePictures([image, sheet], 2, () => 0.99), [sheet, image]);
  });
});
