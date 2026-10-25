import type { Thumbnail } from '../lib/gallery/albums.ts';
import { orderHomeAlbums, samplePictures, type HomeAlbum } from '../lib/gallery/home.ts';

const FEATURED_KEY = 'gallery:featured-album';
const EAGER_CARDS = 4;

function setBackground(element: HTMLElement, thumbnail: Thumbnail): void {
  element.style.backgroundImage = `url("${thumbnail.url}")`;
  element.style.backgroundSize = thumbnail.kind === 'sheet' ? thumbnail.size : 'cover';
  element.style.backgroundPosition = thumbnail.kind === 'sheet' ? thumbnail.position : 'center';
}

// An album may mix sheet cells and ordinary images, so the randomly selected thumbnail can change the element type.
function replaceThumbnail(
  original: HTMLElement,
  thumbnail: Thumbnail,
  options: { eager: boolean; cached: boolean; alt: string },
): void {
  const element = document.createElement(thumbnail.kind === 'sheet' ? 'span' : 'img');
  element.className = original.className;
  element.style.viewTransitionName = original.style.viewTransitionName;
  if (thumbnail.kind === 'sheet') {
    setBackground(element, thumbnail);
    element.dataset.sheetUrl = thumbnail.url;
    element.dataset.sheetBytes = String(thumbnail.bytes);
    element.setAttribute('aria-hidden', 'true');
  } else {
    const image = element as HTMLImageElement;
    image.width = thumbnail.width;
    image.height = thumbnail.height;
    image.loading = options.eager ? 'eager' : 'lazy';
    image.fetchPriority = options.eager ? 'high' : 'auto';
    image.decoding = 'async';
    image.alt = options.alt;
    if (options.cached) {
      image.dataset.galleryImage = '';
      image.dataset.bytes = String(thumbnail.bytes);
    }
    image.src = thumbnail.url;
  }
  original.replaceWith(element);
}

export async function setupHomeGallery(): Promise<void> {
  const wall = document.querySelector<HTMLElement>('[data-album-wall]');
  if (!wall) return;

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}home-albums.json`);
    if (!response.ok) return;
    const albums = (await response.json()) as HomeAlbum[];
    let previous: string | null = null;
    try {
      previous = sessionStorage.getItem(FEATURED_KEY);
    } catch {
      // The first album can still vary when browser storage is unavailable.
    }
    const ordered = orderHomeAlbums(albums, previous);
    const cards = new Map(
      [...wall.querySelectorAll<HTMLElement>('[data-home-album]')].map((card) => [card.dataset.homeAlbum, card]),
    );
    const stars = new Map(
      [...document.querySelectorAll<HTMLElement>('[data-sky-node][data-home-album]')].map((star) => [star.dataset.homeAlbum, star]),
    );

    ordered.forEach((album, position) => {
      const card = cards.get(album.slug);
      if (!card) return;
      wall.append(card);
      card.style.setProperty('--i', String(position));

      const sheets = [...card.querySelectorAll<HTMLElement>('.album-sheet')];
      const star = stars.get(album.slug);
      const skyPictures = [...(star?.querySelectorAll<HTMLElement>('.sky-img') ?? [])];
      const pictures = samplePictures(album.thumbnails, Math.max(sheets.length, skyPictures.length));
      const title = card.querySelector('.album-title')?.textContent?.trim() ?? '';
      sheets.reverse().forEach((sheet, depth) => {
        const thumbnail = pictures[depth];
        if (thumbnail) replaceThumbnail(sheet, thumbnail, {
          eager: position < EAGER_CARDS && depth === 0,
          cached: depth === 0,
          alt: depth === 0 ? title : '',
        });
      });
      skyPictures.forEach((picture, step) => {
        const thumbnail = pictures[step];
        if (thumbnail) replaceThumbnail(picture, thumbnail, {
          eager: step === 0 && Number(star?.style.getPropertyValue('--i')) < 5,
          cached: step === 0,
          alt: step === 0 ? title : '',
        });
      });
      const wash = card.querySelector<HTMLElement>('.album-wash');
      if (wash && pictures[0]) setBackground(wash, pictures[0]);
    });
    const first = ordered[0];
    if (first?.featured && first.thumbnails.length > 0) {
      try {
        sessionStorage.setItem(FEATURED_KEY, first.slug);
      } catch {
        // Remembering the choice is optional.
      }
    }
  } catch {
    // A failed manifest request leaves the complete static home page usable.
  }
}
