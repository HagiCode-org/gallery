// Reads an album's index.json at build time and joins object keys to the public base URL. Build-time only.
import { IMAGE_BASE_URL, type Album } from '../../config/albums.ts';
import { parseIndex, type GalleryIndex } from './indexSchema.ts';

export const INDEX_ATTEMPTS = 3;
export const INDEX_TIMEOUT_MS = 10_000;
export const INDEX_RETRY_DELAY_MS = 500;

export type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export interface SourceOptions {
  readonly fetch?: FetchLike;
  readonly attempts?: number;
  readonly timeoutMs?: number;
  readonly retryDelayMs?: number;
}

export type IndexResult = { readonly status: 'published'; readonly index: GalleryIndex } | { readonly status: 'not-published' };

// The public URL of an object. Each segment is encoded, so a key cannot add a query string or a path.
export function objectUrl(objectKey: string): string {
  return `${IMAGE_BASE_URL}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
}

export function indexObjectKey(album: Pick<Album, 'prefix'>): string {
  return `${album.prefix}/index.json`;
}

// Runs one request with a deadline. The signal aborts the request where fetch honours it; the race covers the rest.
async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timed out after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

// Returns the parsed index, or `not-published` on a 404. Any other failure is retried a bounded number of times, then
// thrown with the album's slug. A body that does not validate is thrown at once, because retrying cannot fix it.
export async function fetchIndex(album: Album, options: SourceOptions = {}): Promise<IndexResult> {
  const fetchFn: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const attempts = options.attempts ?? INDEX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? INDEX_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? INDEX_RETRY_DELAY_MS;
  const url = objectUrl(indexObjectKey(album));

  let lastProblem = 'no attempt made';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let body: unknown;
    try {
      body = await withTimeout(async (signal) => {
        const response = await fetchFn(url, { signal });
        if (response.status === 404) throw new NotPublished();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }, timeoutMs);
    } catch (error) {
      if (error instanceof NotPublished) return { status: 'not-published' };
      lastProblem = error instanceof Error ? error.message : String(error);
      if (attempt < attempts) await delay(retryDelayMs);
      continue;
    }
    return { status: 'published', index: parseIndex(body, album) };
  }

  throw new Error(`Album "${album.slug}": index.json could not be read after ${attempts} attempts (${lastProblem})`);
}

class NotPublished extends Error {}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
