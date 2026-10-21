// Image metadata for the dialog: stale-while-revalidate in its own Cache API cache. Browser-safe, like cache.ts.
import {
  METADATA_CACHE_NAME,
  READ_BUDGET_MS,
  withinBudget,
  type CacheStorageLike,
  type FetchLike,
} from './cache.ts';

export interface ImageMetadata {
  readonly prompt: { readonly positive: string; readonly negative: string };
  readonly seed: number;
  // ISO 8601 UTC, or null when the generation time is unknown.
  readonly generatedAt: string | null;
}

export type MetadataLoad =
  | { readonly status: 'ready'; readonly metadata: ImageMetadata; readonly refresh: Promise<ImageMetadata | null> }
  | { readonly status: 'failed'; readonly reason: string };

export interface MetadataOptions {
  readonly storage: CacheStorageLike | undefined;
  readonly fetch?: FetchLike;
  readonly cacheName?: string;
}

type Fields = Record<string, unknown>;

// Throws when the value is not version 1 metadata. Fields the dialog does not show are ignored.
export function parseMetadata(value: unknown): ImageMetadata {
  const fail: (field: string) => never = (field) => {
    throw new Error(`metadata ${field} is not valid`);
  };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('body');
  const root = value as Fields;
  if (root.version !== 1) fail('version');
  const prompt = root.prompt as Fields | null | undefined;
  if (typeof prompt !== 'object' || prompt === null) fail('prompt');
  if (typeof prompt.positive !== 'string') fail('prompt.positive');
  if (typeof prompt.negative !== 'string') fail('prompt.negative');
  if (!Number.isInteger(root.seed)) fail('seed');
  if (root.generatedAt !== null && typeof root.generatedAt !== 'string') fail('generatedAt');
  return {
    prompt: { positive: prompt.positive as string, negative: prompt.negative as string },
    seed: root.seed as number,
    generatedAt: root.generatedAt as string | null,
  };
}

const JSON_TYPE = { 'content-type': 'application/json' };

// Downloads and validates one metadata body. Throws on a failed status, a network error or an invalid body.
async function fetchValid(url: string, fetchFn: FetchLike): Promise<{ metadata: ImageMetadata; body: string }> {
  const response = await fetchFn(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.text();
  return { metadata: parseMetadata(JSON.parse(body)), body };
}

async function readCachedMetadata(url: string, options: MetadataOptions): Promise<ImageMetadata | null> {
  try {
    const { storage } = options;
    if (!storage) return null;
    const read = (async () => {
      const cache = await storage.open(options.cacheName ?? METADATA_CACHE_NAME);
      const response = await cache.match(url);
      return response ? response.text() : null;
    })();
    const body = await withinBudget(read, READ_BUDGET_MS);
    return body === null ? null : parseMetadata(JSON.parse(body));
  } catch {
    return null;
  }
}

// Replaces the stored copy only with a valid body. Resolves to the new metadata, or null when the copy was kept.
async function refreshMetadata(url: string, options: MetadataOptions, fetchFn: FetchLike): Promise<ImageMetadata | null> {
  try {
    const { metadata, body } = await fetchValid(url, fetchFn);
    if (options.storage) {
      const cache = await options.storage.open(options.cacheName ?? METADATA_CACHE_NAME);
      await cache.put(url, new Response(body, { headers: JSON_TYPE }));
    }
    return metadata;
  } catch {
    return null;
  }
}

// A cached copy is returned at once and refreshed in the background (see `refresh`). Without a cached copy, the
// network is asked; a failure or an invalid body is a failed result, never a thrown error.
export async function loadMetadata(url: string, options: MetadataOptions): Promise<MetadataLoad> {
  const fetchFn: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const cached = await readCachedMetadata(url, options);
  if (cached) {
    return { status: 'ready', metadata: cached, refresh: refreshMetadata(url, options, fetchFn) };
  }
  try {
    const fresh = await refreshMetadata(url, options, fetchFn);
    if (fresh) return { status: 'ready', metadata: fresh, refresh: Promise.resolve(null) };
    return { status: 'failed', reason: 'no valid metadata' };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
