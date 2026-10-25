import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const deployWorkflowPath = path.join(root, '.github', 'workflows', 'gallery-deploy-gh-pages.yml');
const ciWorkflowPath = path.join(root, '.github', 'workflows', 'gallery-ci.yml');
const contractDir = path.join(root, '.github', 'gh-pages');

// The workflows are checked as text, since the repository has no YAML parser. Each job block runs from its
// two-space header to the next job header, which keeps assertions scoped to the job they describe.
function jobBlock(text, name) {
  const headers = [...text.matchAll(/^ {2}([a-z-]+):$/gmu)];
  const index = headers.findIndex((match) => match[1] === name);
  assert.notEqual(index, -1, `workflow has no ${name} job`);
  const start = headers[index].index;
  const end = headers[index + 1]?.index ?? text.length;
  return text.slice(start, end);
}

// Drop full-line // comments, which the Wrangler contract uses, before JSON.parse.
function parseJsonc(text) {
  return JSON.parse(text.replace(/^\s*\/\/.*$/gmu, ''));
}

const deployWorkflow = await readFile(deployWorkflowPath, 'utf8');
const build = jobBlock(deployWorkflow, 'build');
const deploy = jobBlock(deployWorkflow, 'deploy');

const ciWorkflow = await readFile(ciWorkflowPath, 'utf8');
const ci = jobBlock(ciWorkflow, 'ci');

describe('gallery deploy workflow contract', () => {
  // Contract item 1.
  it('starts on a push to main, on manual dispatch and on an hourly rebuild only', () => {
    assert.match(
      deployWorkflow,
      /^on:\n {2}push:\n {4}branches:\n {6}- main\n {2}workflow_dispatch:\n(?: {2}#.*\n)* {2}schedule:\n {4}- cron: "\d+ \* \* \* \*"\n\n/mu,
    );
    assert.doesNotMatch(deployWorkflow, /^ {2}pull_request(_target)?:/mu);
  });

  // Contract item 8.
  it('serializes runs without cancelling a run in progress', () => {
    assert.match(deployWorkflow, /^concurrency:\n {2}group: gallery-deploy-gh-pages\n {2}cancel-in-progress: false$/mu);
  });

  // Contract item 2.
  it('keeps the top-level token read-only', () => {
    assert.match(deployWorkflow, /^permissions:\n {2}contents: read$/mu);
  });

  // Contract item 3.
  it('verifies the build before staging the payload', () => {
    assert.match(build, /run: npm run verify\b/u);
    assert.match(build, /HAGILIGHT_BUILD_BRANCH: \$\{\{ github\.ref_name \}\}/u);
    assert.match(build, /run: node scripts\/assemble-gh-pages-payload\.mjs/u);
    assert.ok(build.indexOf('npm run verify') < build.indexOf('assemble-gh-pages-payload'));
  });

  // Contract items 2 and 5: the build job stages the payload and uploads it with hidden files kept.
  it('keeps the build job read-only and uploads the staged payload with hidden files', () => {
    assert.match(build, /^ {4}permissions:\n {6}contents: read$/mu);
    assert.doesNotMatch(build, /contents: write/u);
    assert.match(build, /uses: actions\/upload-artifact@v4/u);
    assert.match(build, /if-no-files-found: error/u);
    assert.match(build, /include-hidden-files: true/u);
  });

  // Contract item 7: a failed build stops before the deploy job exists.
  it('publishes only after the build job succeeds', () => {
    assert.match(deploy, /^ {4}needs: build$/mu);
  });

  // Contract item 4: the deploy job downloads the payload and never installs or builds.
  it('downloads the staged payload and does not install or build in the deploy job', () => {
    assert.match(deploy, /uses: actions\/download-artifact@v4/u);
    assert.doesNotMatch(deploy, /npm ci\b/u);
    assert.doesNotMatch(deploy, /npm run (build|verify)\b/u);
    assert.doesNotMatch(deploy, /run: .*astro build/u);
  });

  // Contract item 6.
  it('publishes a single orphan commit without Jekyll processing', () => {
    assert.match(deploy, /^ {4}permissions:\n {6}contents: write$/mu);
    assert.match(deploy, /publish_branch: gh-pages/u);
    assert.match(deploy, /force_orphan: true/u);
    assert.match(deploy, /enable_jekyll: false/u);
  });

  it('warms the domains after publication', () => {
    assert.match(deploy, /run: npm run deploy:warmup -- --summary-markdown/u);
    assert.ok(deploy.indexOf('peaceiris/actions-gh-pages@v4') < deploy.indexOf('deploy:warmup'));
  });

  // Contract item 9: environment name and URL are visible on the run.
  it('attaches the deploy job to the gallery production environment', () => {
    assert.match(deploy, /^ {4}environment:\n {6}name: gallery-production\n {6}url: https:\/\/gallery\.hagicode\.com$/mu);
  });

  // Contract item 9: the summary lists the payload and the warmup table, and notes a publish-then-warmup failure.
  it('summarizes the payload and the warmup outcome even when an earlier step fails', () => {
    assert.match(deploy, /if: always\(\)/u);
    assert.match(deploy, /## Payload contents/u);
    assert.match(deploy, /cat "\$GALLERY_WARMUP_SUMMARY_PATH" >> "\$GITHUB_STEP_SUMMARY"/u);
    assert.match(deploy, /already published before warmup verification failed/u);
  });

  it('never runs on a pull request', () => {
    assert.doesNotMatch(deployWorkflow, /pull_request/u);
  });
});

describe('gallery pull request CI workflow contract', () => {
  it('runs on pull requests to main only', () => {
    assert.match(ciWorkflow, /^on:\n {2}pull_request:\n {4}branches:\n {6}- main\n/mu);
    assert.doesNotMatch(ciWorkflow, /push:/u);
  });

  it('keeps the token read-only with no write permission', () => {
    assert.match(ciWorkflow, /^permissions:\n {2}contents: read$/mu);
    assert.doesNotMatch(ciWorkflow, /: write\b/u);
  });

  it('runs install, locale audit, type check, tests and verification in that order', () => {
    const commands = ['run: npm ci', 'run: npm run i18n:check', 'run: npm run check', 'run: npm test', 'run: npm run verify'];
    let previous = -1;
    for (const command of commands) {
      const position = ci.indexOf(command);
      assert.notEqual(position, -1, `CI job has no "${command}" step`);
      assert.ok(position > previous, `"${command}" must come after the previous command`);
      previous = position;
    }
  });

  it('has no step that publishes', () => {
    assert.doesNotMatch(ciWorkflow, /actions-gh-pages|upload-artifact|deploy:|deploy:warmup|gh-pages\s+push/u);
  });
});

describe('gallery Cloudflare contract files', () => {
  it('esa.jsonc names the gallery site and serves ./dist with no-op install and build', async () => {
    const esa = parseJsonc(await readFile(path.join(contractDir, 'esa.jsonc'), 'utf8'));

    assert.equal(esa.name, 'hagicode gallery');
    assert.equal(esa.installCommand, 'echo nice');
    assert.equal(esa.buildCommand, 'echo nice');
    assert.equal(esa.assets.directory, './dist');
  });

  it('wrangler.jsonc names the gallery worker and serves ./dist as static assets', async () => {
    const wrangler = parseJsonc(await readFile(path.join(contractDir, 'wrangler.jsonc'), 'utf8'));

    assert.equal(wrangler.name, 'gallery');
    assert.equal(wrangler.assets.directory, './dist');
    assert.equal(typeof wrangler.compatibility_date, 'string');
    assert.equal(wrangler.observability.logs.enabled, true);
  });
});
