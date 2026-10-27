import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { SITE_EVENT_STRING_MAX_LENGTH, SITE_POSTHOG_EVENTS, captureSiteEvent } from '../../src/lib/posthog-events.ts';

const FORBIDDEN_KEYS = ['site_id', 'site_framework', 'hagilight_version', 'locale', 'page_type'];

function fakePostHog(overrides = {}) {
  return {
    __loaded: true,
    capture: mock.fn(),
    has_opted_out_capturing: mock.fn(() => false),
    ...overrides,
  };
}

function lastCall(fn) {
  return fn.mock.calls.at(-1)?.arguments;
}

afterEach(() => {
  delete globalThis.window;
  mock.restoreAll();
});

describe('captureSiteEvent', () => {
  it('sends nothing for an event name that is not in the table', () => {
    const posthog = fakePostHog();
    captureSiteEvent('gallery_image_deleted', { album: 'hero-art' }, { posthog });
    assert.equal(posthog.capture.mock.callCount(), 0);
  });

  it('drops a property whose key is not in the event allowlist', () => {
    const posthog = fakePostHog();
    captureSiteEvent('gallery_image_opened', { album: 'hero-art', image_url: 'https://cdn.example/a.avif' }, { posthog });
    assert.deepEqual(lastCall(posthog.capture), ['gallery_image_opened', { album: 'hero-art' }]);
  });

  it('drops values that are not a string, finite number or boolean', () => {
    const posthog = fakePostHog();
    captureSiteEvent('gallery_image_opened', { album: { nested: true } }, { posthog });
    assert.deepEqual(lastCall(posthog.capture), ['gallery_image_opened', {}]);
    captureSiteEvent('gallery_image_opened', { album: ['hero-art'] }, { posthog });
    assert.deepEqual(lastCall(posthog.capture), ['gallery_image_opened', {}]);
    captureSiteEvent('gallery_image_opened', { album: 42 }, { posthog });
    assert.deepEqual(lastCall(posthog.capture), ['gallery_image_opened', {}]);
  });

  it('truncates a string over the maximum length', () => {
    const posthog = fakePostHog();
    captureSiteEvent('gallery_image_opened', { album: 'a'.repeat(300) }, { posthog });
    const [, properties] = lastCall(posthog.capture);
    assert.equal(properties.album.length, SITE_EVENT_STRING_MAX_LENGTH);
    assert.equal(SITE_EVENT_STRING_MAX_LENGTH, 128);
  });

  it('drops the hagilight super properties even when the caller supplies them', () => {
    const posthog = fakePostHog();
    captureSiteEvent(
      'gallery_image_opened',
      { album: 'hero-art', site_id: 'gallery', site_framework: 'astro', hagilight_version: '0.18.0', locale: 'en-US', page_type: 'album' },
      { posthog },
    );
    assert.deepEqual(lastCall(posthog.capture), ['gallery_image_opened', { album: 'hero-art' }]);
  });

  it('sends nothing and does not throw when window.posthog is undefined', () => {
    globalThis.window = {};
    assert.doesNotThrow(() => captureSiteEvent('gallery_image_opened', { album: 'hero-art' }));
    globalThis.window = { posthog: undefined };
    assert.doesNotThrow(() => captureSiteEvent('gallery_image_zoomed'));
  });

  it('reads window.posthog when no posthog option is given', () => {
    const posthog = fakePostHog();
    globalThis.window = { posthog };
    captureSiteEvent('gallery_image_zoomed');
    assert.deepEqual(lastCall(posthog.capture), ['gallery_image_zoomed', {}]);
  });

  it('queues on the stub without checking opt-out when __loaded is not true', () => {
    const posthog = fakePostHog({ __loaded: false });
    captureSiteEvent('gallery_image_opened', { album: 'hero-art' }, { posthog });
    assert.deepEqual(lastCall(posthog.capture), ['gallery_image_opened', { album: 'hero-art' }]);
    assert.equal(posthog.has_opted_out_capturing.mock.callCount(), 0);
  });

  it('sends nothing once the visitor has opted out', () => {
    const posthog = fakePostHog({ has_opted_out_capturing: mock.fn(() => true) });
    captureSiteEvent('gallery_image_opened', { album: 'hero-art' }, { posthog });
    assert.equal(posthog.capture.mock.callCount(), 0);
  });

  it('sends nothing when the consent gate says no', () => {
    const posthog = fakePostHog();
    captureSiteEvent('gallery_image_zoomed', {}, { posthog, isAllowed: () => false });
    assert.equal(posthog.capture.mock.callCount(), 0);
  });

  it('returns normally when capture throws', () => {
    const posthog = fakePostHog({
      capture: mock.fn(() => {
        throw new Error('network down');
      }),
    });
    assert.doesNotThrow(() => captureSiteEvent('gallery_image_opened', { album: 'hero-art' }, { posthog }));
  });
});

describe('site event table', () => {
  it('names every event in snake_case with the object first', () => {
    for (const name of Object.keys(SITE_POSTHOG_EVENTS)) {
      assert.match(name, /^[a-z]+(_[a-z]+)+$/, name);
    }
  });

  it('never lists a hagilight super property as an event key', () => {
    for (const [name, keys] of Object.entries(SITE_POSTHOG_EVENTS)) {
      for (const key of Object.keys(keys)) {
        assert.ok(!FORBIDDEN_KEYS.includes(key), `${name} lists ${key}`);
      }
    }
  });

  it('sends exactly the allowlisted set for every event, with URL, free text and super properties in the input', () => {
    const representative = {
      album: 'hero-art',
      url: 'https://gallery.hagicode.com/albums/hero-art/a.avif?token=abc#frag',
      text: 'a free-text caption with spaces',
      caption: 'free text',
      prompt: 'positive prompt',
      site_id: 'gallery',
      site_framework: 'astro',
      hagilight_version: '0.18.0',
      locale: 'en-US',
      page_type: 'album',
    };
    for (const [name, keys] of Object.entries(SITE_POSTHOG_EVENTS)) {
      const posthog = fakePostHog();
      captureSiteEvent(name, representative, { posthog });
      assert.equal(posthog.capture.mock.callCount(), 1, name);
      const [sentName, sent] = lastCall(posthog.capture);
      assert.equal(sentName, name);
      assert.deepEqual(Object.keys(sent).sort(), Object.keys(keys).sort(), name);
      for (const value of Object.values(sent)) {
        assert.ok(!String(value).includes('http'), `${name} sent a URL-like value`);
      }
    }
  });
});
