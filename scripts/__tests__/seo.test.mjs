import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SITE_URL } from '../../src/config/site.ts';
import {
  STRUCTURED_IMAGE_LIMIT,
  albumMetaDescription,
  albumStructuredData,
  homeStructuredData,
  imageAlt,
  imageObject,
} from '../../src/lib/seo.ts';

const entry = (n) => ({
  key: `cat-${n}`,
  objectKey: `cats/cat-${n}.avif`,
  width: 1024,
  height: 768,
  bytes: 100,
  sheetCell: null,
  metadata: null,
});
const index = (count) => ({
  version: 1,
  range: { count, first: 'cat-0', last: `cat-${count - 1}` },
  sheet: null,
  entries: Array.from({ length: count }, (_, n) => entry(n)),
});

describe('SEO text', () => {
  it('names a picture by its key and album', () => {
    assert.equal(imageAlt('cat-1', 'Cats'), 'cat-1 – Cats');
  });

  it('adds the image count to an album description', () => {
    assert.equal(albumMetaDescription('Cat heads.', '12 images'), 'Cat heads. 12 images');
  });
});

describe('structured data', () => {
  it('describes an image from the index entry only', () => {
    assert.deepEqual(imageObject(entry(1), 'Cats'), {
      '@type': 'ImageObject',
      contentUrl: 'https://img-gen.hagicode.com/cats/cat-1.avif',
      name: 'cat-1 – Cats',
      width: 1024,
      height: 768,
      encodingFormat: 'image/avif',
    });
  });

  it('lists the albums on the home page with locale-prefixed addresses', () => {
    const [site, list] = homeStructuredData('ja-JP', 'Desc', [{ slug: 'cats', title: 'Cats' }]);
    assert.equal(site['@type'], 'WebSite');
    assert.equal(site.inLanguage, 'ja-JP');
    assert.equal(list.itemListElement[0].url, `${SITE_URL}/ja-JP/albums/cats/`);
  });

  it('gives an album page a collection, a breadcrumb and a bounded image list', () => {
    const [page, crumbs] = albumStructuredData({
      locale: 'en-US',
      slug: 'cats',
      title: 'Cats',
      description: 'Desc',
      index: index(STRUCTURED_IMAGE_LIMIT + 10),
      homeLabel: 'Home',
    });
    assert.equal(page['@type'], 'CollectionPage');
    assert.equal(page.url, `${SITE_URL}/albums/cats/`);
    assert.equal(page.associatedMedia.length, STRUCTURED_IMAGE_LIMIT);
    assert.equal(crumbs['@type'], 'BreadcrumbList');
    assert.equal(crumbs.itemListElement[1].item, `${SITE_URL}/albums/cats/`);
  });
});
