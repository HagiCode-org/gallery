// The gallery's one client script: a plain module, not an island. It reads what the markup carries (data-* attributes
// written at build time) and never parses an index. It upgrades thumbnails to cached copies, opens the image dialog and
// keeps the URL fragment in step with it. Every cache call is a miss on failure, so the page is never blocked by it.
import { pruneOldCaches, readCached, storeCached, type CacheStorageLike } from '../lib/image-cache/cache.ts';
import { loadMetadata, type ImageMetadata } from '../lib/image-cache/metadata.ts';

const STORE_CONCURRENCY = 4;
const UNKNOWN = 'Unknown';
const NOT_PUBLISHED = 'No description is published for this image.';
const NOT_LOADED = 'The description could not be loaded.';
const LOADING = 'Loading the description…';

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

function formatGeneratedAt(value: string | null): string {
  if (value === null) return UNKNOWN;
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return UNKNOWN;
  return `${time.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function setupDialog(dialog: HTMLDialogElement, grid: HTMLElement): void {
  const items = [...grid.querySelectorAll<HTMLAnchorElement>('a.gallery-item')];
  const title = dialog.querySelector<HTMLElement>('[data-dialog-title]');
  const figure = dialog.querySelector<HTMLElement>('[data-dialog-figure]');
  const status = dialog.querySelector<HTMLElement>('[data-dialog-status]');
  const previous = dialog.querySelector<HTMLButtonElement>('[data-dialog-previous]');
  const next = dialog.querySelector<HTMLButtonElement>('[data-dialog-next]');
  const close = dialog.querySelector<HTMLButtonElement>('[data-dialog-close]');
  if (!title || !figure || !status || !previous || !next || !close) return;

  let current = -1;
  let opener: HTMLAnchorElement | null = null;
  // True when this dialog pushed its fragment, so closing it goes back one history entry.
  let pushed = false;
  let metadataRequest = 0;

  const fact = (name: string) => dialog.querySelector<HTMLElement>(`[data-fact="${name}"]`);
  const field = (name: string) => dialog.querySelector<HTMLElement>(`[data-field="${name}"]`);

  const setFields = (metadata: ImageMetadata | null) => {
    field('positive')!.textContent = metadata?.prompt.positive ?? '—';
    field('negative')!.textContent = metadata?.prompt.negative ?? '—';
    field('seed')!.textContent = metadata ? String(metadata.seed) : '—';
    field('generatedAt')!.textContent = metadata ? formatGeneratedAt(metadata.generatedAt) : '—';
  };

  const showImage = (item: HTMLAnchorElement) => {
    const url = item.getAttribute('href') ?? '';
    const bytes = Number(item.dataset.bytes);
    const image = document.createElement('img');
    image.className = 'gallery-dialog-image';
    image.alt = item.dataset.key ?? '';
    image.width = Number(item.dataset.width);
    image.height = Number(item.dataset.height);
    image.src = url;
    figure.replaceChildren(image);
    if (Number.isFinite(bytes)) {
      void readCached(url, bytes, { storage }).then((blob) => {
        if (blob && figure.contains(image)) image.src = URL.createObjectURL(blob);
      });
    }
  };

  const showFacts = (item: HTMLAnchorElement) => {
    title.textContent = item.getAttribute('aria-label') ?? item.dataset.key ?? '';
    fact('key')!.textContent = item.dataset.key ?? '';
    fact('size')!.textContent = `${item.dataset.width} × ${item.dataset.height} px`;
    fact('bytes')!.textContent = `${Number(item.dataset.bytes).toLocaleString('en-US')} bytes`;
  };

  const showMetadata = async (item: HTMLAnchorElement) => {
    const request = ++metadataRequest;
    const metadataUrl = item.dataset.metadata;
    setFields(null);
    if (!metadataUrl) {
      status.textContent = NOT_PUBLISHED;
      return;
    }
    status.textContent = LOADING;
    const result = await loadMetadata(metadataUrl, { storage });
    if (request !== metadataRequest) return;
    if (result.status === 'failed') {
      status.textContent = NOT_LOADED;
      return;
    }
    status.textContent = '';
    setFields(result.metadata);
    void result.refresh.then((fresh) => {
      if (fresh && request === metadataRequest) setFields(fresh);
    });
  };

  const showAt = (index: number) => {
    const item = items[index];
    if (!item) return;
    current = index;
    showFacts(item);
    showImage(item);
    void showMetadata(item);
    previous.disabled = index === 0;
    next.disabled = index === items.length - 1;
    whenIdle(() => {
      for (const neighbour of [items[index - 1], item, items[index + 1]]) {
        if (neighbour) enqueueStore(neighbour.getAttribute('href') ?? '', Number(neighbour.dataset.bytes));
      }
    });
  };

  const keyOf = (index: number) => encodeURIComponent(items[index]?.dataset.key ?? '');

  const open = (index: number, source: 'thumbnail' | 'deep-link') => {
    if (!dialog.open) {
      opener = items[index] ?? null;
      dialog.showModal();
      // A fragment opened on load is already in the address bar, so it is replaced rather than pushed.
      if (source === 'thumbnail') {
        history.pushState(null, '', `#${keyOf(index)}`);
        pushed = true;
      }
    }
    showAt(index);
    if (pushed || source === 'deep-link') history.replaceState(null, '', `#${keyOf(index)}`);
  };

  const move = (delta: number) => {
    const target = current + delta;
    if (target < 0 || target >= items.length) return;
    showAt(target);
    history.replaceState(null, '', `#${keyOf(target)}`);
  };

  dialog.addEventListener('close', () => {
    const wasPushed = pushed;
    pushed = false;
    current = -1;
    metadataRequest += 1;
    if (wasPushed) {
      history.back();
    } else if (location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    opener?.focus();
    opener = null;
  });

  close.addEventListener('click', () => dialog.close());
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    }
  });

  // Back from an open image closes the dialog. The fragment is already gone at that point, so nothing is pushed.
  window.addEventListener('popstate', () => {
    if (!dialog.open) return;
    const fragment = decodeURIComponent(location.hash.slice(1));
    if (items[current]?.dataset.key === fragment) return;
    pushed = false;
    dialog.close();
  });

  grid.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const link = (event.target as Element).closest<HTMLAnchorElement>('a.gallery-item');
    const index = link ? items.indexOf(link) : -1;
    if (index < 0) return;
    event.preventDefault();
    open(index, 'thumbnail');
  });

  const fragment = decodeURIComponent(location.hash.slice(1));
  if (fragment) {
    const index = items.findIndex((item) => item.dataset.key === fragment);
    if (index >= 0) open(index, 'deep-link');
  }
}

function start(): void {
  if (storage) void pruneOldCaches({ storage });
  upgradeSheets();
  watchVisibleImages();
  const dialog = document.querySelector<HTMLDialogElement>('[data-gallery-dialog]');
  const grid = document.querySelector<HTMLElement>('[data-gallery-grid]');
  if (dialog && grid) setupDialog(dialog, grid);
  whenPageReady(() => {
    pageReady = true;
    pump();
  });
}

start();
