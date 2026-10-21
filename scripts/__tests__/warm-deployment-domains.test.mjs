import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  GALLERY_WARMUP_CONFIG,
  WarmupRunError,
  main,
  normalizeWarmupConfig,
  parseArgs,
  renderWarmupSummary,
  runWarmup,
  warmDomain,
} from '../warm-deployment-domains.mjs';

const silentLogger = { log() {}, warn() {}, error() {} };

// Each entry is consumed in order per request: a number is an HTTP status, an Error is a thrown failure,
// and an object carries a status with a response body.
function scriptedFetch(responses) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const next = responses.shift();
    if (next instanceof Error) {
      throw next;
    }
    const { status, body = '' } = typeof next === 'number' ? { status: next } : next;
    return { status, text: async () => body };
  };
  return { fetchImpl, calls };
}

function recordingWait() {
  const waits = [];
  return {
    waits,
    wait: async (milliseconds) => {
      waits.push(milliseconds);
    },
  };
}

// Domain-keyed fetch so that runWarmup can be driven per domain.
function domainFetch(plan) {
  const calls = [];
  const fetchImpl = async (url) => {
    const domain = new URL(url).hostname;
    calls.push(url);
    const queue = plan[domain] ?? [];
    const next = queue.shift();
    if (next instanceof Error) {
      throw next;
    }
    const { status, body = '' } = typeof next === 'number' ? { status: next } : next;
    return { status, text: async () => body };
  };
  return { fetchImpl, calls };
}

const testConfig = { ...GALLERY_WARMUP_CONFIG, retryDelayMs: 1, timeoutMs: 500 };
let workspace;

before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), 'gallery-warmup-'));
});

after(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('GALLERY_WARMUP_CONFIG', () => {
  it('targets the gallery worker domain and the production domain with the shared limits', () => {
    assert.deepEqual(GALLERY_WARMUP_CONFIG.domains, ['gallery.472158246.workers.dev', 'gallery.hagicode.com']);
    assert.equal(GALLERY_WARMUP_CONFIG.maxAttempts, 4);
    assert.equal(GALLERY_WARMUP_CONFIG.retryDelayMs, 3000);
    assert.equal(GALLERY_WARMUP_CONFIG.timeoutMs, 10000);
  });
});

describe('warmDomain', () => {
  it('succeeds on the first try without waiting', async () => {
    const { fetchImpl, calls } = scriptedFetch([200]);
    const { wait, waits } = recordingWait();

    const result = await warmDomain('gallery.hagicode.com', { config: testConfig, fetchImpl, wait, logger: silentLogger });

    assert.equal(result.ok, true);
    assert.equal(result.retriesUsed, 0);
    assert.equal(result.finalDetail, 'HTTP 200');
    assert.equal(calls.length, 1);
    assert.deepEqual(waits, []);
  });

  it('retries a failing status and stops once the domain responds', async () => {
    const { fetchImpl, calls } = scriptedFetch([503, 200]);
    const { wait, waits } = recordingWait();

    const result = await warmDomain('gallery.hagicode.com', { config: testConfig, fetchImpl, wait, logger: silentLogger });

    assert.equal(result.ok, true);
    assert.equal(result.retriesUsed, 1);
    assert.equal(result.attempts.length, 2);
    assert.equal(calls.length, 2);
    assert.deepEqual(waits, [testConfig.retryDelayMs]);
    assert.equal(result.finalDetail, 'HTTP 200');
  });

  it('treats a 3xx response as success without retrying', async () => {
    const { fetchImpl, calls } = scriptedFetch([301]);
    const { wait, waits } = recordingWait();

    const result = await warmDomain('gallery.hagicode.com', { config: testConfig, fetchImpl, wait, logger: silentLogger });

    assert.equal(result.ok, true);
    assert.equal(result.retriesUsed, 0);
    assert.equal(calls.length, 1);
    assert.deepEqual(waits, []);
  });

  it('retries after a network error and then succeeds', async () => {
    const { fetchImpl } = scriptedFetch([new TypeError('fetch failed'), 200]);
    const { wait, waits } = recordingWait();

    const result = await warmDomain('gallery.472158246.workers.dev', { config: testConfig, fetchImpl, wait, logger: silentLogger });

    assert.equal(result.ok, true);
    assert.equal(result.attempts[0].ok, false);
    assert.equal(result.attempts[0].detail, 'fetch failed');
    assert.equal(result.retriesUsed, 1);
    assert.deepEqual(waits, [testConfig.retryDelayMs]);
  });

  it('reports the final status and retries exhausted when every attempt fails', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      { status: 500, body: 'upstream   broke' },
      { status: 500, body: 'upstream   broke' },
      { status: 500, body: 'upstream   broke' },
      { status: 502, body: 'bad gateway' },
    ]);
    const { wait, waits } = recordingWait();

    const result = await warmDomain('gallery.hagicode.com', { config: testConfig, fetchImpl, wait, logger: silentLogger });

    assert.equal(result.ok, false);
    assert.equal(result.domain, 'gallery.hagicode.com');
    assert.equal(result.attempts.length, 4);
    assert.equal(calls.length, 4);
    assert.equal(waits.length, 3);
    assert.match(result.finalDetail, /HTTP 502 - bad gateway/u);
    assert.match(result.finalDetail, /retries exhausted after 4\/4 attempts/u);
  });

  it('reports a timed out request with the configured timeout', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    const { fetchImpl } = scriptedFetch([timeout, timeout, timeout, timeout]);
    const { wait } = recordingWait();

    const result = await warmDomain('gallery.hagicode.com', { config: testConfig, fetchImpl, wait, logger: silentLogger });

    assert.equal(result.ok, false);
    assert.match(result.finalDetail, /Request timed out after 500ms/u);
  });
});

describe('runWarmup', () => {
  it('warms both domains in one run when both respond', async () => {
    const { fetchImpl, calls } = domainFetch({
      'gallery.472158246.workers.dev': [200],
      'gallery.hagicode.com': [204],
    });
    const { wait } = recordingWait();

    const result = await runWarmup({ config: testConfig, fetchImpl, wait, logger: silentLogger });

    assert.equal(result.successCount, 2);
    assert.equal(result.failureCount, 0);
    assert.deepEqual(calls, ['https://gallery.472158246.workers.dev/', 'https://gallery.hagicode.com/']);
  });

  it('throws WarmupRunError carrying per-domain results when a domain exhausts its retries', async () => {
    const { fetchImpl } = domainFetch({
      'gallery.472158246.workers.dev': [200],
      'gallery.hagicode.com': [500, 500, 500, 500],
    });
    const { wait } = recordingWait();

    await assert.rejects(
      runWarmup({ config: testConfig, fetchImpl, wait, logger: silentLogger }),
      (error) => {
        assert.ok(error instanceof WarmupRunError);
        assert.equal(error.name, 'WarmupRunError');
        assert.match(error.message, /gallery\.hagicode\.com/u);
        assert.match(error.message, /retries exhausted/u);
        assert.equal(error.result.successCount, 1);
        assert.equal(error.result.failureCount, 1);
        assert.equal(error.result.domainResults[1].domain, 'gallery.hagicode.com');
        return true;
      },
    );
  });
});

describe('normalizeWarmupConfig', () => {
  it('strips scheme and trailing slashes from domains', () => {
    const config = normalizeWarmupConfig({ ...testConfig, domains: [' https://gallery.hagicode.com// '] });
    assert.deepEqual(config.domains, ['gallery.hagicode.com']);
  });

  it('rejects a config without domains', () => {
    assert.throws(() => normalizeWarmupConfig({ ...testConfig, domains: [] }), /at least one domain is required/u);
  });

  it('rejects non-positive limits', () => {
    assert.throws(() => normalizeWarmupConfig({ ...testConfig, maxAttempts: 0 }), /maxAttempts must be a positive integer/u);
    assert.throws(() => normalizeWarmupConfig({ ...testConfig, retryDelayMs: -1 }), /retryDelayMs must be a positive integer/u);
    assert.throws(() => normalizeWarmupConfig({ ...testConfig, timeoutMs: 1.5 }), /timeoutMs must be a positive integer/u);
  });
});

describe('renderWarmupSummary', () => {
  it('lists each domain with its result, attempts, and final detail', async () => {
    const { fetchImpl } = domainFetch({
      'gallery.472158246.workers.dev': [503, 200],
      'gallery.hagicode.com': [301],
    });
    const { wait } = recordingWait();
    const result = await runWarmup({ config: testConfig, fetchImpl, wait, logger: silentLogger });

    const markdown = renderWarmupSummary(result);

    assert.match(markdown, /^## Deployment domain warmup/u);
    assert.match(markdown, /Successful domains: 2\/2/u);
    assert.match(markdown, /\| `gallery\.472158246\.workers\.dev` \| warmed after retry \| 2\/4 \| HTTP 200 \|/u);
    assert.match(markdown, /\| `gallery\.hagicode\.com` \| warmed \| 1\/4 \| HTTP 301 \|/u);
    assert.doesNotMatch(markdown, /does not roll back/u);
  });

  it('states that a failed warmup does not roll back gh-pages', async () => {
    const { fetchImpl } = domainFetch({
      'gallery.472158246.workers.dev': [200],
      'gallery.hagicode.com': [404, 404, 404, 404],
    });
    const { wait } = recordingWait();

    await assert.rejects(runWarmup({ config: testConfig, fetchImpl, wait, logger: silentLogger }), (error) => {
      const markdown = renderWarmupSummary(error.result);
      assert.match(markdown, /Successful domains: 1\/2/u);
      assert.match(markdown, /\| `gallery\.hagicode\.com` \| failed \| 4\/4 \|/u);
      assert.match(markdown, /Warmup failure does not roll back the published `gh-pages` snapshot/u);
      return true;
    });
  });
});

describe('command line', () => {
  it('parses --summary-markdown and rejects unknown arguments', () => {
    assert.deepEqual(parseArgs(['--summary-markdown', './.deploy/summary.md']), { summaryMarkdownPath: './.deploy/summary.md' });
    assert.deepEqual(parseArgs([]), { summaryMarkdownPath: null });
    assert.throws(() => parseArgs(['--summary-markdown']), /Missing value for --summary-markdown/u);
    assert.throws(() => parseArgs(['--unknown']), /Unknown argument: --unknown/u);
  });

  it('writes the summary file when the warmup succeeds', async () => {
    const summaryPath = path.join(workspace, 'nested', 'summary.md');
    const { fetchImpl } = domainFetch({
      'gallery.472158246.workers.dev': [200],
      'gallery.hagicode.com': [200],
    });
    const { wait } = recordingWait();

    await main(['--summary-markdown', summaryPath], { config: testConfig, fetchImpl, wait, logger: silentLogger });

    const written = await readFile(summaryPath, 'utf8');
    assert.match(written, /Successful domains: 2\/2/u);
  });

  it('writes the summary file before rethrowing a failed warmup', async () => {
    const summaryPath = path.join(workspace, 'failed', 'summary.md');
    const { fetchImpl } = domainFetch({
      'gallery.472158246.workers.dev': [500, 500, 500, 500],
      'gallery.hagicode.com': [200],
    });
    const { wait } = recordingWait();

    await assert.rejects(
      main(['--summary-markdown', summaryPath], { config: testConfig, fetchImpl, wait, logger: silentLogger }),
      WarmupRunError,
    );

    const written = await readFile(summaryPath, 'utf8');
    assert.match(written, /Successful domains: 1\/2/u);
  });
});
