import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { coverFragment, coverKeyFromHash, fitWithin, nextPanelIndex, samplePictures } from '../../src/lib/gallery/home.ts';

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

describe('thumbnail size', () => {
  it('fits the longest edge and keeps the shape', () => {
    assert.deepEqual(fitWithin(1024, 1024, 400), { width: 400, height: 400 });
    assert.deepEqual(fitWithin(1232, 704, 400), { width: 400, height: 229 });
    assert.deepEqual(fitWithin(704, 1232, 400), { width: 229, height: 400 });
  });

  it('does not enlarge a small picture and never returns a zero side', () => {
    assert.deepEqual(fitWithin(64, 32, 400), { width: 64, height: 32 });
    assert.deepEqual(fitWithin(10000, 1, 400), { width: 400, height: 1 });
  });
});

describe('cover fragment', () => {
  it('round-trips an image key, including one that needs escaping', () => {
    for (const key of ['hero-001', 'a b/c#d?e', '猫-01']) {
      assert.equal(coverKeyFromHash(coverFragment(key)), key);
    }
  });

  it('ignores a bare image key, which belongs to the viewer, and malformed input', () => {
    assert.equal(coverKeyFromHash('#hero-001'), null);
    assert.equal(coverKeyFromHash(''), null);
    assert.equal(coverKeyFromHash('#cover='), null);
    assert.equal(coverKeyFromHash('#cover=%E0%A4%A'), null);
  });
});

describe('model room turn', () => {
  it('moves to the next published panel, skips pending ones and wraps around', () => {
    const openable = [true, false, true, true, false];
    assert.equal(nextPanelIndex(openable, 0), 2);
    assert.equal(nextPanelIndex(openable, 2), 3);
    assert.equal(nextPanelIndex(openable, 3), 0);
  });

  it('stays put when no other panel can open', () => {
    assert.equal(nextPanelIndex([true, false], 0), 0);
    assert.equal(nextPanelIndex([], 0), 0);
  });
});
