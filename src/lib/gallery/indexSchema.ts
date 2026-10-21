// Parses <prefix>/index.json as published by img-gen (openspec change r2-image-index-metadata). Build-time only.
// Only the fields the gallery uses survive parsing; unknown fields such as `meta` are dropped here.

export interface SheetCell {
  readonly column: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface IndexSheet {
  readonly objectKey: string;
  readonly bytes: number;
  readonly cell: number;
  readonly columns: number;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
}

export interface IndexMetadataRef {
  readonly objectKey: string;
}

export interface IndexEntry {
  readonly key: string;
  readonly objectKey: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly sheetCell: SheetCell | null;
  readonly metadata: IndexMetadataRef | null;
}

export interface GalleryIndex {
  readonly version: 1;
  readonly range: { readonly count: number; readonly first: string | null; readonly last: string | null };
  readonly sheet: IndexSheet | null;
  readonly entries: readonly IndexEntry[];
}

// The album fields the schema needs. Keeping the type local lets the Node tests import this file without the config.
export interface SchemaAlbum {
  readonly slug: string;
  readonly prefix: string;
}

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// A URL, an absolute path, a `..` segment, or anything outside `<prefix>/` is refused, so an index cannot point the
// site at another origin, another album or a file outside its prefix.
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/iu;

export function parseIndex(value: unknown, album: SchemaAlbum): GalleryIndex {
  // Typed as a function declaration-like signature so TypeScript narrows after each `if (...) fail(...)`.
  const fail: (field: string, problem: string) => never = (field, problem) => {
    throw new Error(`Album "${album.slug}": ${field} ${problem}`);
  };

  const requireRecord = (input: unknown, field: string): Fields => {
    if (!isRecord(input)) fail(field, 'must be an object');
    return input as Fields;
  };

  const requireInt = (input: unknown, field: string, min: number): number => {
    if (!Number.isInteger(input) || (input as number) < min) {
      fail(field, `must be an integer of at least ${min}, found ${JSON.stringify(input)}`);
    }
    return input as number;
  };

  const requireObjectKey = (input: unknown, field: string): string => {
    if (typeof input !== 'string' || input.length === 0) fail(field, 'must be a non-empty string');
    const objectKey = input as string;
    if (URL_SCHEME.test(objectKey) || objectKey.startsWith('/') || objectKey.includes('\\')) {
      fail(field, `must be a relative object key, found "${objectKey}"`);
    }
    if (objectKey.split('/').includes('..')) fail(field, `must not contain "..", found "${objectKey}"`);
    if (!objectKey.startsWith(`${album.prefix}/`)) {
      fail(field, `must start with "${album.prefix}/", found "${objectKey}"`);
    }
    return objectKey;
  };

  const root = requireRecord(value, 'index');

  if (root.version !== 1) fail('version', `must be 1, found ${JSON.stringify(root.version)}`);

  const sheetInput = root.sheet ?? null;
  let sheet: IndexSheet | null = null;
  if (sheetInput !== null) {
    const raw = requireRecord(sheetInput, 'sheet');
    sheet = {
      objectKey: requireObjectKey(raw.objectKey, 'sheet.objectKey'),
      bytes: requireInt(raw.bytes, 'sheet.bytes', 0),
      cell: requireInt(raw.cell, 'sheet.cell', 1),
      columns: requireInt(raw.columns, 'sheet.columns', 1),
      rows: requireInt(raw.rows, 'sheet.rows', 1),
      width: requireInt(raw.width, 'sheet.width', 1),
      height: requireInt(raw.height, 'sheet.height', 1),
    };
  }

  if (!Array.isArray(root.entries)) fail('entries', 'must be an array');
  const entries = (root.entries as unknown[]).map((item, position): IndexEntry => {
    const field = `entries[${position}]`;
    const raw = requireRecord(item, field);

    if (typeof raw.key !== 'string' || raw.key.length === 0) fail(`${field}.key`, 'must be a non-empty string');

    let sheetCell: SheetCell | null = null;
    if ((raw.sheetCell ?? null) !== null) {
      const cell = requireRecord(raw.sheetCell, `${field}.sheetCell`);
      sheetCell = {
        column: requireInt(cell.column, `${field}.sheetCell.column`, 0),
        row: requireInt(cell.row, `${field}.sheetCell.row`, 0),
        x: requireInt(cell.x, `${field}.sheetCell.x`, 0),
        y: requireInt(cell.y, `${field}.sheetCell.y`, 0),
        width: requireInt(cell.width, `${field}.sheetCell.width`, 1),
        height: requireInt(cell.height, `${field}.sheetCell.height`, 1),
      };
      if (sheet === null) fail(`${field}.sheetCell`, 'is set but the index has no sheet');
      if (sheetCell.column >= sheet.columns) fail(`${field}.sheetCell.column`, `must be below ${sheet.columns}`);
      if (sheetCell.row >= sheet.rows) fail(`${field}.sheetCell.row`, `must be below ${sheet.rows}`);
    }

    let metadata: IndexMetadataRef | null = null;
    if ((raw.metadata ?? null) !== null) {
      const ref = requireRecord(raw.metadata, `${field}.metadata`);
      metadata = { objectKey: requireObjectKey(ref.objectKey, `${field}.metadata.objectKey`) };
    }

    return {
      key: raw.key as string,
      objectKey: requireObjectKey(raw.objectKey, `${field}.objectKey`),
      width: requireInt(raw.width, `${field}.width`, 1),
      height: requireInt(raw.height, `${field}.height`, 1),
      bytes: requireInt(raw.bytes, `${field}.bytes`, 0),
      sheetCell,
      metadata,
    };
  });

  const range = requireRecord(root.range, 'range');
  const count = requireInt(range.count, 'range.count', 0);
  if (count !== entries.length) {
    fail('range.count', `is ${count} but entries lists ${entries.length}`);
  }
  const first = range.first ?? null;
  const last = range.last ?? null;
  if ((first !== null && typeof first !== 'string') || (last !== null && typeof last !== 'string')) {
    fail('range.first and range.last', 'must be strings or null');
  }

  return {
    version: 1,
    range: { count, first: first as string | null, last: last as string | null },
    sheet,
    entries,
  };
}
