// Motion that belongs to the lists, not to the viewer: the pointer spotlight, the develop-on-load fade, the thumbnail-size
// control and the "which images are on screen" readout. Every part is an enhancement over markup that already works,
// and each one steps aside for reduced motion or a missing browser feature.
import { formatPosition } from '../lib/viewer/transform.ts';

const DENSITY_KEY = 'gallery:density';
const DENSITIES = ['small', 'medium', 'large'] as const;
type Density = (typeof DENSITIES)[number];

const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The light that follows the cursor over an album's art or a thumbnail. CSS draws it from --mx and --my.
export function setupSpotlight(): void {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let frame = 0;
  let host: HTMLElement | null = null;
  let x = 0;
  let y = 0;
  document.addEventListener(
    'pointermove',
    (event) => {
      const target = (event.target as Element).closest<HTMLElement>('.album-art, .gallery-item');
      if (!target) return;
      const box = target.getBoundingClientRect();
      host = target;
      x = event.clientX - box.left;
      y = event.clientY - box.top;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        host?.style.setProperty('--mx', `${x}px`);
        host?.style.setProperty('--my', `${y}px`);
      });
    },
    { passive: true },
  );
}

// The first screens develop as their pictures arrive: a thumbnail is clear until its image has loaded and then fades in.
// The fade is tied to the real load, so a slow connection shows the album filling in rather than a wall of placeholders.
// Only the first two screens take part. Further down the images load while still off screen, and fading dozens at once
// during a scroll costs frames for nothing anyone sees. Without script, or for a cached image that is complete at once,
// the picture is simply there.
export function setupReveal(grid: HTMLElement): void {
  if (prefersReducedMotion()) return;
  const limit = window.scrollY + window.innerHeight * 2;
  for (const image of grid.querySelectorAll<HTMLImageElement>('img.gallery-thumb')) {
    if (image.complete && image.naturalWidth > 0) continue;
    if (image.getBoundingClientRect().top + window.scrollY > limit) continue;
    image.dataset.loading = '';
    const done = () => delete image.dataset.loading;
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
  }
}

function readDensity(): Density {
  try {
    const stored = localStorage.getItem(DENSITY_KEY);
    if (DENSITIES.includes(stored as Density)) return stored as Density;
  } catch {
    // Storage can be blocked; the default size is right.
  }
  return 'medium';
}

// The S / M / L control. Changing the size keeps whatever was at the middle of the screen at the middle of the screen,
// so a 1000-image album does not throw the reader back to the top.
export function setupDensity(page: HTMLElement, grid: HTMLElement, controls: HTMLElement): void {
  const buttons = [...controls.querySelectorAll<HTMLButtonElement>('[data-density-step]')];
  const apply = (density: Density) => {
    page.dataset.density = density;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.densityStep === density));
  };
  apply(readDensity());
  controls.hidden = false;

  controls.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-density-step]');
    const density = button?.dataset.densityStep as Density | undefined;
    if (!density || density === page.dataset.density) return;
    const middle = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const anchor = middle?.closest<HTMLElement>('.gallery-grid > li') ?? null;
    apply(density);
    try {
      localStorage.setItem(DENSITY_KEY, density);
    } catch {
      // Not remembering the choice is fine.
    }
    if (anchor && grid.contains(anchor)) {
      const box = anchor.getBoundingClientRect();
      window.scrollBy({ top: box.top + box.height / 2 - window.innerHeight / 2, behavior: 'instant' });
    }
  });
}

// "041 – 096 / 720": the span of images on screen, for an album too long to hold in the head.
export function setupRange(grid: HTMLElement, readout: HTMLElement): void {
  if (!('IntersectionObserver' in window)) return;
  const total = grid.children.length;
  const positions = new Map<Element, number>([...grid.children].map((cell, position) => [cell, position]));
  const visible = new Set<number>();
  let frame = 0;
  const paint = () => {
    frame = 0;
    if (visible.size === 0) {
      readout.hidden = true;
      return;
    }
    let first = Infinity;
    let last = -Infinity;
    for (const position of visible) {
      first = Math.min(first, position);
      last = Math.max(last, position);
    }
    const [low] = formatPosition(first + 1, total).split(' / ');
    readout.textContent = `${low} – ${formatPosition(last + 1, total)}`;
    readout.hidden = false;
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const position = positions.get(entry.target);
        if (position === undefined) continue;
        if (entry.isIntersecting) visible.add(position);
        else visible.delete(position);
      }
      if (!frame) frame = requestAnimationFrame(paint);
    },
    { rootMargin: '-52px 0px 0px 0px' },
  );
  for (const cell of grid.children) observer.observe(cell);
}
