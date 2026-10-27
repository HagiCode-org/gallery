// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupViewer, type ViewerDeps } from './viewer.ts';

// The markup the build writes for the viewer and the album grid, reduced to the parts the script reads.
const FIXTURE = `
<dialog id="gallery-dialog" data-gallery-dialog data-locale="en-US">
  <div data-viewer>
    <h2 data-dialog-title></h2>
    <p data-viewer-count></p>
    <div data-viewer-stage>
      <figure data-dialog-figure></figure>
    </div>
    <div data-viewer-ambient></div>
    <div data-viewer-panel>
      <span data-fact="key"></span>
      <span data-fact="size"></span>
      <span data-fact="bytes"></span>
      <span data-field="positive"></span>
      <span data-field="negative"></span>
      <span data-field="seed"></span>
      <span data-field="generatedAt"></span>
      <button type="button" data-copy="positive"></button>
      <button type="button" data-copy="negative"></button>
    </div>
    <p data-dialog-status></p>
    <button type="button" data-dialog-previous>previous</button>
    <button type="button" data-dialog-next>next</button>
    <button type="button" data-dialog-close>close</button>
    <button type="button" data-dialog-info>info</button>
    <button type="button" data-viewer-zoom><svg><path data-zoom-plus></path></svg></button>
  </div>
</dialog>
<ul data-gallery-grid data-album="hero-art">
  <li><a class="gallery-item" href="/albums/hero-art/one.avif" data-key="one" data-index="0" data-bytes="1000" data-width="800" data-height="600">one</a></li>
  <li><a class="gallery-item" href="/albums/hero-art/two.avif" data-key="two" data-index="1" data-bytes="1200" data-width="800" data-height="600">two</a></li>
  <li><a class="gallery-item" href="/albums/hero-art/three.avif" data-key="three" data-index="2" data-bytes="1400" data-width="800" data-height="600">three</a></li>
</ul>`;

interface FakePostHog {
  __loaded: boolean;
  capture: ReturnType<typeof vi.fn>;
  has_opted_out_capturing: ReturnType<typeof vi.fn>;
}

function fakePostHog(optedOut = false): FakePostHog {
  return {
    __loaded: true,
    capture: vi.fn(),
    has_opted_out_capturing: vi.fn(() => optedOut),
  };
}

function deps(): ViewerDeps {
  return {
    readCached: vi.fn(async () => null),
    enqueueStore: vi.fn(),
    loadMetadata: vi.fn(async () => ({ status: 'failed' as const, reason: 'none' })),
    whenIdle: (task: () => void) => task(),
  };
}

function mount(): { dialog: HTMLDialogElement; grid: HTMLElement } {
  document.body.innerHTML = FIXTURE;
  const dialog = document.querySelector<HTMLDialogElement>('[data-gallery-dialog]')!;
  const grid = document.querySelector<HTMLElement>('[data-gallery-grid]')!;
  setupViewer(dialog, grid, deps());
  return { dialog, grid };
}

function thumb(index: number): HTMLAnchorElement {
  return document.querySelectorAll<HTMLAnchorElement>('a.gallery-item')[index]!;
}

function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function zoomEvents(posthog: FakePostHog): unknown[] {
  return posthog.capture.mock.calls.filter(([name]) => name === 'gallery_image_zoomed');
}

function openEvents(posthog: FakePostHog): unknown[] {
  return posthog.capture.mock.calls.filter(([name]) => name === 'gallery_image_opened');
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no dialog methods that open or close, no view transitions, and no media query support.
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof HTMLDialogElement.prototype.close !== 'function') {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: true,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  history.replaceState(null, '', '/albums/hero-art/');
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as { posthog?: unknown }).posthog;
  document.body.innerHTML = '';
});

describe('gallery_image_opened', () => {
  it('sends one event with the album when a thumbnail opens the viewer', () => {
    const posthog = fakePostHog();
    (window as unknown as { posthog: FakePostHog }).posthog = posthog;
    const { dialog } = mount();

    thumb(1).click();

    expect(dialog.hasAttribute('open')).toBe(true);
    expect(openEvents(posthog)).toEqual([['gallery_image_opened', { album: 'hero-art' }]]);
  });

  it('does not send an event when the next image is shown inside an open viewer', () => {
    const posthog = fakePostHog();
    (window as unknown as { posthog: FakePostHog }).posthog = posthog;
    mount();
    thumb(0).click();
    const next = document.querySelector<HTMLButtonElement>('[data-dialog-next]')!;

    next.click();
    next.click();

    expect(document.querySelector('[data-fact="key"]')?.textContent).toBe('three');
    expect(openEvents(posthog)).toHaveLength(1);
  });

  it('sends nothing without PostHog and still opens the viewer', () => {
    const { dialog } = mount();

    expect(() => thumb(0).click()).not.toThrow();
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('sends nothing after opt-out and still opens the viewer', () => {
    const posthog = fakePostHog(true);
    (window as unknown as { posthog: FakePostHog }).posthog = posthog;
    const { dialog } = mount();

    thumb(0).click();

    expect(dialog.hasAttribute('open')).toBe(true);
    expect(openEvents(posthog)).toHaveLength(0);
  });
});

describe('gallery_image_zoomed', () => {
  it('sends one event for a multi-step zoom gesture', () => {
    const posthog = fakePostHog();
    (window as unknown as { posthog: FakePostHog }).posthog = posthog;
    const { dialog } = mount();
    thumb(0).click();

    press(dialog, '+');
    vi.advanceTimersByTime(300);
    press(dialog, '+');
    vi.advanceTimersByTime(300);
    press(dialog, '+');

    expect(zoomEvents(posthog)).toEqual([['gallery_image_zoomed', {}]]);
  });

  it('sends a second event for a zoom gesture that starts after the idle gap', () => {
    const posthog = fakePostHog();
    (window as unknown as { posthog: FakePostHog }).posthog = posthog;
    const { dialog } = mount();
    thumb(0).click();

    press(dialog, '+');
    press(dialog, '+');
    vi.advanceTimersByTime(700);
    press(dialog, '+');

    expect(zoomEvents(posthog)).toHaveLength(2);
  });

  it('does not send an event for a reset to rest', () => {
    const posthog = fakePostHog();
    (window as unknown as { posthog: FakePostHog }).posthog = posthog;
    const { dialog } = mount();
    thumb(0).click();

    press(dialog, '0');

    expect(zoomEvents(posthog)).toHaveLength(0);
  });
});
