// The gallery's one client script: a plain module, not an island. It reads what the markup carries (data-* attributes
// written at build time) and never parses an index. It upgrades thumbnails to cached copies and starts the motion of
// the lists (grid-motion.ts) and the image viewer (viewer.ts). Every cache call is a miss on failure, so the page is
// never blocked by it.
import { pruneOldCaches, readCached, storeCached, type CacheStorageLike } from '../lib/image-cache/cache.ts';
import { loadMetadata } from '../lib/image-cache/metadata.ts';
import { setupDensity, setupRange, setupReveal, setupSpotlight } from './grid-motion.ts';
import { setupViewer } from './viewer.ts';

const STORE_CONCURRENCY = 4;

const storage: CacheStorageLike | undefined =
  typeof caches === 'undefined' ? undefined : (caches as unknown as CacheStorageLike);

// Stores run only after the page has loaded and the browser is idle, a few at a time.
let pageReady = false;
const writeQueue: { url: string; bytes: number }[] = [];
const queued = new Set<string>();
let activeWrites = 0;

function enqueueStore(url: string, bytes: number): void {
  if (!storage || queued.has(url)) return;
  queued.add(url);
  writeQueue.push({ url, bytes });
  pump();
}

function pump(): void {
  if (!pageReady) return;
  while (activeWrites < STORE_CONCURRENCY && writeQueue.length > 0) {
    const job = writeQueue.shift();
    if (!job) return;
    activeWrites += 1;
    void storeIfMissing(job.url, job.bytes).finally(() => {
      activeWrites -= 1;
      pump();
    });
  }
}

async function storeIfMissing(url: string, bytes: number): Promise<void> {
  if ((await readCached(url, bytes, { storage })) !== null) return;
  await storeCached(url, bytes, { storage });
}

function whenIdle(task: () => void): void {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(task, { timeout: 2000 });
  } else {
    setTimeout(task, 1);
  }
}

function whenPageReady(task: () => void): void {
  const start = () => whenIdle(task);
  if (document.readyState === 'complete') {
    start();
  } else {
    window.addEventListener('load', start, { once: true });
  }
}

// The image of one element is swapped for a cached copy when one exists; otherwise the copy is queued for storing.
function upgradeImage(image: HTMLImageElement): void {
  const url = image.getAttribute('src');
  const bytes = Number(image.dataset.bytes);
  if (!url || !Number.isFinite(bytes)) return;
  void readCached(url, bytes, { storage }).then((blob) => {
    if (blob) {
      image.src = URL.createObjectURL(blob);
    } else {
      enqueueStore(url, bytes);
    }
  });
}

// Sprite sheets are read once per URL and applied to every cell that shows that sheet.
function upgradeSheets(): void {
  const sheets = new Map<string, { bytes: number; elements: HTMLElement[] }>();
  for (const element of document.querySelectorAll<HTMLElement>('[data-sheet-url]')) {
    const url = element.dataset.sheetUrl ?? '';
    const bytes = Number(element.dataset.sheetBytes);
    if (!url || !Number.isFinite(bytes)) continue;
    const sheet = sheets.get(url) ?? { bytes, elements: [] };
    sheet.elements.push(element);
    sheets.set(url, sheet);
  }
  for (const [url, sheet] of sheets) {
    void readCached(url, sheet.bytes, { storage }).then((blob) => {
      if (blob) {
        const blobUrl = `url("${URL.createObjectURL(blob)}")`;
        for (const element of sheet.elements) element.style.backgroundImage = blobUrl;
      } else {
        enqueueStore(url, sheet.bytes);
      }
    });
  }
}

// Lazy images are upgraded and queued only when they scroll into view, so no whole-album prefetch happens.
function watchVisibleImages(): void {
  const images = [...document.querySelectorAll<HTMLImageElement>('img[data-gallery-image]')];
  if (!('IntersectionObserver' in window)) {
    images.forEach(upgradeImage);
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        upgradeImage(entry.target as HTMLImageElement);
      }
    },
    { rootMargin: '200px' },
  );
  images.forEach((image) => observer.observe(image));
}

function start(): void {
  if (storage) void pruneOldCaches({ storage });
  upgradeSheets();
  watchVisibleImages();
  setupSpotlight();
  const dialog = document.querySelector<HTMLDialogElement>('[data-gallery-dialog]');
  const grid = document.querySelector<HTMLElement>('[data-gallery-grid]');
  const page = document.querySelector<HTMLElement>('.album-page');
  const density = document.querySelector<HTMLElement>('[data-density-control]');
  const range = document.querySelector<HTMLElement>('[data-album-range]');
  if (grid) {
    setupReveal(grid);
    if (page && density) setupDensity(page, grid, density);
    if (range) setupRange(grid, range);
  }
  if (dialog && grid) {
    setupViewer(dialog, grid, {
      readCached: (url, bytes) => readCached(url, bytes, { storage }),
      enqueueStore,
      loadMetadata: (url) => loadMetadata(url, { storage }),
      whenIdle,
    });
  }
  whenPageReady(() => {
    pageReady = true;
    pump();
  });
}

start();
