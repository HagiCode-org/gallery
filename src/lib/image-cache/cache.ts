// Browser-side Cache API helpers for the gallery. Imports nothing from Astro or the configuration: callers pass the
// storage, the fetch function and the URLs with their byte sizes. Every failure is a miss, and nothing here rejects.

export const CACHE_PREFIX = 'hagicode-gallery-';
export const IMAGE_CACHE_NAME = 'hagicode-gallery-images-v1';
export const METADATA_CACHE_NAME = 'hagicode-gallery-metadata-v1';
// A cache read that is not finished by this deadline counts as a miss, so the page never waits on the cache.
export const READ_BUDGET_MS = 150;
// The byte size of the stored object, read back to check it against the index.
export const BYTES_HEADER = 'x-gallery-bytes';

export interface CacheLike {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
}

export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

export type FetchLike = (url: string, init?: { credentials: 'omit'; cache?: 'reload' }) => Promise<Response>;

export interface StorageOptions {
  readonly storage: CacheStorageLike | undefined;
  readonly cacheName?: string;
}

// Resolves to the task's value, or to null when the task is not finished within `ms`.
export async function withinBudget<T>(task: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([task, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

// A stored copy, or null for a miss: no Cache API, no entry, a read that is late or fails, or a stored size that
// differs from the `bytes` the index gives now.
export async function readCached(url: string, bytes: number, options: StorageOptions): Promise<Blob | null> {
  try {
    const { storage } = options;
    if (!storage) return null;
    const cacheName = options.cacheName ?? IMAGE_CACHE_NAME;
    const read = (async () => {
      const cache = await storage.open(cacheName);
      const response = await cache.match(url);
      if (!response || response.headers.get(BYTES_HEADER) !== String(bytes)) return null;
      return response.blob();
    })();
    return (await withinBudget(read, READ_BUDGET_MS)) ?? null;
  } catch {
    return null;
  }
}

// Downloads an object and stores it under its URL. Only a successful response is stored, and only when its size is the
// size the index gives, so a stale index never writes a copy that a later read would reject. Resolves to whether it
// stored the object. Credentials are omitted: the request carries nothing a visitor could be identified by. The
// browser's HTTP cache is bypassed: it may hold the answer to a plain <img> load, which has no CORS header.
export async function storeCached(
  url: string,
  bytes: number,
  options: StorageOptions & { readonly fetch?: FetchLike },
): Promise<boolean> {
  try {
    const { storage } = options;
    if (!storage) return false;
    const fetchFn: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
    const response = await fetchFn(url, { credentials: 'omit', cache: 'reload' });
    if (!response.ok) return false;
    const blob = await response.blob();
    if (blob.size !== bytes) return false;
    const cache = await storage.open(options.cacheName ?? IMAGE_CACHE_NAME);
    await cache.put(
      url,
      new Response(blob, {
        headers: { 'content-type': blob.type || 'application/octet-stream', [BYTES_HEADER]: String(bytes) },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

// Deletes every cache whose name carries the gallery prefix but is not one of the current names. Caches of other
// applications on the origin are left alone. Resolves to the names it deleted.
export async function pruneOldCaches(options: {
  readonly storage: CacheStorageLike | undefined;
  readonly current?: readonly string[];
}): Promise<string[]> {
  try {
    const { storage } = options;
    if (!storage) return [];
    const current = new Set(options.current ?? [IMAGE_CACHE_NAME, METADATA_CACHE_NAME]);
    const stale = (await storage.keys()).filter((name) => name.startsWith(CACHE_PREFIX) && !current.has(name));
    await Promise.all(stale.map((name) => storage.delete(name).catch(() => false)));
    return stale;
  } catch {
    return [];
  }
}
