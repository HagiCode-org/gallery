import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { assembleGhPagesPayload } from '../assemble-gh-pages-payload.mjs';

let workspace;

async function writeTree(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
}

function createSourceFiles({ omit = [] } = {}) {
  const files = {
    '.github/gh-pages/esa.jsonc': '{ "name": "hagicode gallery" }\n',
    '.github/gh-pages/wrangler.jsonc': '{ "name": "gallery" }\n',
    'dist/index.html': '<!doctype html><title>home</title>\n',
    'dist/en-us/page/index.html': '<!doctype html><title>page</title>\n',
    'dist/.well-known/hagilight.metadata.json': '{}\n',
  };
  for (const relativePath of omit) {
    delete files[relativePath];
  }
  return files;
}

async function createSourceRoot(name, options) {
  const sourceRoot = path.join(workspace, name);
  await writeTree(sourceRoot, createSourceFiles(options));
  return sourceRoot;
}

async function listRelative(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const collected = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      collected.push(...(await listRelative(root, absolute)));
    } else {
      collected.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }
  return collected.sort();
}

before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), 'gallery-payload-'));
});

after(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('assembleGhPagesPayload', () => {
  it('stages the contract files and dist/ at the payload root', async () => {
    const sourceRoot = await createSourceRoot('layout-source');
    const outputDir = path.join(workspace, 'layout-output');

    const result = await assembleGhPagesPayload({ sourceRoot, outputDir });

    assert.equal(result, outputDir);
    assert.deepEqual(await listRelative(outputDir), [
      'dist/.well-known/hagilight.metadata.json',
      'dist/en-us/page/index.html',
      'dist/index.html',
      'esa.jsonc',
      'wrangler.jsonc',
    ]);
    assert.equal(await readFile(path.join(outputDir, 'dist', 'index.html'), 'utf8'), '<!doctype html><title>home</title>\n');
    assert.equal(await readFile(path.join(outputDir, 'esa.jsonc'), 'utf8'), '{ "name": "hagicode gallery" }\n');
    assert.equal(await readFile(path.join(outputDir, 'wrangler.jsonc'), 'utf8'), '{ "name": "gallery" }\n');
  });

  it('replaces an existing output directory on re-run', async () => {
    const sourceRoot = await createSourceRoot('rerun-source');
    const outputDir = path.join(workspace, 'rerun-output');
    await writeTree(outputDir, {
      'stale.txt': 'left over from an earlier run\n',
      'dist/old-page/index.html': 'removed by the next run\n',
    });

    await assembleGhPagesPayload({ sourceRoot, outputDir });

    assert.deepEqual(await listRelative(outputDir), [
      'dist/.well-known/hagilight.metadata.json',
      'dist/en-us/page/index.html',
      'dist/index.html',
      'esa.jsonc',
      'wrangler.jsonc',
    ]);
  });

  it('keeps the previous payload when an input is missing', async () => {
    const sourceRoot = await createSourceRoot('keep-source', { omit: ['dist/index.html'] });
    const outputDir = path.join(workspace, 'keep-output');
    await writeTree(outputDir, { 'esa.jsonc': 'previous payload\n' });

    await assert.rejects(assembleGhPagesPayload({ sourceRoot, outputDir }));

    assert.equal(await readFile(path.join(outputDir, 'esa.jsonc'), 'utf8'), 'previous payload\n');
  });

  it('names dist/index.html when the build output is missing', async () => {
    const sourceRoot = await createSourceRoot('missing-index', { omit: ['dist/index.html'] });

    await assert.rejects(
      assembleGhPagesPayload({ sourceRoot, outputDir: path.join(workspace, 'missing-index-output') }),
      (error) => {
        assert.match(error.message, /dist\/index\.html/u);
        assert.doesNotMatch(error.message, /esa\.jsonc|wrangler\.jsonc/u);
        return true;
      },
    );
  });

  it('names esa.jsonc when the ESA contract file is missing', async () => {
    const sourceRoot = await createSourceRoot('missing-esa', {
      omit: ['.github/gh-pages/esa.jsonc'],
    });

    await assert.rejects(
      assembleGhPagesPayload({ sourceRoot, outputDir: path.join(workspace, 'missing-esa-output') }),
      (error) => {
        assert.match(error.message, /esa\.jsonc/u);
        assert.doesNotMatch(error.message, /wrangler\.jsonc|dist\/index\.html/u);
        return true;
      },
    );
  });

  it('names wrangler.jsonc when the Wrangler contract file is missing', async () => {
    const sourceRoot = await createSourceRoot('missing-wrangler', {
      omit: ['.github/gh-pages/wrangler.jsonc'],
    });

    await assert.rejects(
      assembleGhPagesPayload({ sourceRoot, outputDir: path.join(workspace, 'missing-wrangler-output') }),
      (error) => {
        assert.match(error.message, /wrangler\.jsonc/u);
        assert.doesNotMatch(error.message, /esa\.jsonc|dist\/index\.html/u);
        return true;
      },
    );
  });

  it('names every missing input in one error', async () => {
    const sourceRoot = await createSourceRoot('missing-all', {
      omit: ['.github/gh-pages/esa.jsonc', '.github/gh-pages/wrangler.jsonc', 'dist/index.html'],
    });

    await assert.rejects(
      assembleGhPagesPayload({ sourceRoot, outputDir: path.join(workspace, 'missing-all-output') }),
      (error) => {
        assert.match(error.message, /esa\.jsonc/u);
        assert.match(error.message, /wrangler\.jsonc/u);
        assert.match(error.message, /dist\/index\.html/u);
        return true;
      },
    );
  });
});
