// Checks the foundation facts of the built site. Run after `npm run build`; `npm run verify` does both.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_NAME, SITE_URL } from '../src/config/site.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const SITE_ORIGIN = new URL(SITE_URL).origin;
const PAGE_ORIGIN = `${SITE_URL}/`;
const HAGILIGHT_PACKAGES = ['@hagicode/hagilight', '@hagicode/hagilight-core'];
const FORBIDDEN_PUBLIC_FILES = ['robots.txt', 'sitemap.xml', 'llms.txt', 'favicon.ico', 'favicon.svg'];
const EXACT_VERSION = /^\d+\.\d+\.\d+$/u;
// Distinctive lines from the installed Hagilight packages. Finding one in project source means package source was copied.
const HAGILIGHT_SOURCE_MARKERS = ['export function parsePageMeta(', 'export function buildLlmsTxt(', 'hagilight-footer__sections'];
// Selectors that would restyle the Hagilight footer or its brand block from the site.
const HAGILIGHT_FOOTER_SELECTOR = /hagilight-(?:footer|brand)/u;
const CLIENT_DIRECTIVE = /\bclient:(?:load|idle|visible|media|only)\b/u;
const SHADCN_TOKENS = [
  'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
  'accent', 'accent-foreground', 'destructive', 'border', 'input', 'ring', 'radius',
];
const DISCOVERY_FILES = ['sitemap-index.xml', 'robots.txt', 'rss.xml', 'llms.txt', '.well-known/hagilight.metadata.json'];

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const fileExists = (path) => existsSync(path) && statSync(path).isFile();
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// Every file below `dir`, skipping the directories named in `skipped` (project source skips build output by default).
const SOURCE_SKIPPED_DIRS = new Set(['node_modules', 'dist', '.astro', '.git', '.deploy']);
const filesUnder = (dir, skipped = SOURCE_SKIPPED_DIRS) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return skipped.has(entry.name) ? [] : filesUnder(path, skipped);
    return entry.isFile() ? [path] : [];
  });
};

// Resolve an href to a URL on the site, or null when it is not a web address.
const siteUrl = (href) => {
  try {
    const url = new URL(href, PAGE_ORIGIN);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};

// Map a same-site URL to the build output file that serves it, or null when nothing does.
const distFileFor = (url) => {
  const path = decodeURIComponent(url.pathname);
  const candidates = path.endsWith('/')
    ? [`${path}index.html`]
    : [path, `${path}/index.html`, `${path}.html`];
  return candidates.map((candidate) => join(dist, candidate)).find(fileExists) ?? null;
};

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'u'))?.[1];
const decodeAttr = (value) => value.replaceAll('&amp;', '&');

// Pins: both Hagilight packages exact, identical, and the installed copies match the manifest.
const packageJson = readJson(join(root, 'package.json'));
const pinned = Object.fromEntries(HAGILIGHT_PACKAGES.map((name) => [name, packageJson.dependencies?.[name]]));
for (const name of HAGILIGHT_PACKAGES) {
  expect(EXACT_VERSION.test(pinned[name] ?? ''), `${name} must be pinned to an exact version, found "${pinned[name]}"`);
}
const hagilightVersion = pinned['@hagicode/hagilight'];
expect(
  hagilightVersion === pinned['@hagicode/hagilight-core'],
  `Hagilight pins differ: @hagicode/hagilight ${pinned['@hagicode/hagilight']}, @hagicode/hagilight-core ${pinned['@hagicode/hagilight-core']}`,
);
for (const name of HAGILIGHT_PACKAGES) {
  const installedManifest = join(root, 'node_modules', name, 'package.json');
  if (!fileExists(installedManifest)) {
    failures.push(`${name} is not installed; run npm install`);
    continue;
  }
  const installed = readJson(installedManifest).version;
  expect(installed === pinned[name], `${name} installed ${installed} does not match pinned ${pinned[name]}`);
}

// Every page in the build output: one language, one canonical, one title, one description, one h1, one footer,
// one icon, and no island or hydration script. Internal targets must exist in dist/.
const htmlFiles = filesUnder(dist).filter((file) => file.endsWith('.html'));
expect(htmlFiles.some((file) => relative(dist, file) === 'index.html'), 'dist/index.html is missing; run npm run build first');

const sharedIcon = join(root, 'node_modules', '@hagicode', 'hagilight-core', 'favicon.ico');
for (const file of htmlFiles) {
  const page = `dist/${relative(dist, file).split(sep).join('/')}`;
  const pageRoute = `/${relative(dist, file).split(sep).join('/').replace(/index\.html$/u, '')}`;
  const pageUrl = new URL(pageRoute, PAGE_ORIGIN).href;
  const html = readFileSync(file, 'utf8');
  const metaTags = html.match(/<meta\b[^>]*>/giu) ?? [];
  const linkTags = html.match(/<link\b[^>]*>/giu) ?? [];

  expect(/<html\b[^>]*\slang="en-US"/u.test(html), `${page} root element must declare lang="en-US"`);
  expect((html.match(/<title>/giu) ?? []).length === 1, `${page} must contain exactly one <title>`);
  const canonicalLinks = linkTags.filter((tag) => attr(tag, 'rel') === 'canonical');
  expect(canonicalLinks.length === 1, `${page} must contain exactly one canonical link, found ${canonicalLinks.length}`);
  expect(
    canonicalLinks.length !== 1 || decodeAttr(attr(canonicalLinks[0], 'href') ?? '') === pageUrl,
    `${page} canonical link must be ${pageUrl}`,
  );
  const descriptionTags = metaTags.filter((tag) => attr(tag, 'name') === 'description');
  expect(descriptionTags.length === 1, `${page} must contain exactly one description meta, found ${descriptionTags.length}`);
  for (const [key, value] of [
    ['property', 'og:title'],
    ['property', 'og:description'],
    ['name', 'twitter:title'],
    ['name', 'twitter:description'],
  ]) {
    const count = metaTags.filter((tag) => attr(tag, key) === value).length;
    expect(count === 1, `${page} must contain exactly one <meta ${key}="${value}">, found ${count}`);
  }
  expect(!/astro-island|hydrat/iu.test(html), `${page} must not contain an island or hydration script`);

  // Footer: exactly one, with attribution, build labels, and sitemap and RSS links that resolve.
  const footers = html.match(/<footer\b[\s\S]*?<\/footer>/giu) ?? [];
  expect(footers.length === 1, `${page} must contain exactly one footer, found ${footers.length}`);
  const footer = footers[0] ?? '';
  const footerText = footer.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ');
  for (const label of [`Powered By hagilight@${hagilightVersion}`, 'Branch:', 'Commit:', 'Built:']) {
    expect(footerText.includes(label), `${page} footer must show "${label}"`);
  }
  const footerHrefs = [...footer.matchAll(/<a\b[^>]*\shref="([^"]*)"/giu)].map((match) => decodeAttr(match[1]));
  for (const [suffix, label] of [['sitemap-index.xml', 'sitemap'], ['rss.xml', 'RSS']]) {
    const link = footerHrefs.map(siteUrl).find((url) => url?.origin === SITE_ORIGIN && url.pathname.endsWith(suffix));
    expect(link !== undefined, `${page} footer must link the ${label} (${suffix})`);
    expect(link === undefined || distFileFor(link) !== null, `${page} footer ${label} link does not resolve to a file in dist/: ${link?.href}`);
  }

  // Favicon: one icon link that serves the shared Hagilight icon bytes.
  const iconLinks = linkTags.filter((tag) => /\brel="[^"]*\bicon\b/u.test(tag));
  expect(iconLinks.length === 1, `${page} must link exactly one favicon, found ${iconLinks.length}`);
  if (iconLinks.length === 1) {
    const iconUrl = siteUrl(decodeAttr(attr(iconLinks[0], 'href') ?? ''));
    const iconFile = iconUrl ? distFileFor(iconUrl) : null;
    expect(iconFile !== null, `${page} favicon link does not resolve to a file in dist/`);
    expect(
      iconFile === null || readFileSync(iconFile).equals(readFileSync(sharedIcon)),
      `${page} favicon file in dist/ is not the shared Hagilight favicon`,
    );
  }

  // Every same-site link and stylesheet target on the page exists in the build output.
  for (const [, href] of html.matchAll(/<(?:a|link)\b[^>]*\shref="([^"]*)"/giu)) {
    const decoded = decodeAttr(href);
    if (decoded.startsWith('#')) continue;
    const url = siteUrl(decoded);
    if (url === null || url.origin !== SITE_ORIGIN) continue;
    expect(distFileFor(url) !== null, `${page} links to a target missing from dist/: ${decoded}`);
  }

  // One top-level heading per page: the site name on the home page, the album title on an album page.
  expect((html.match(/<h1\b/giu) ?? []).length === 1, `${page} must contain exactly one <h1>`);

  // shadcn content: the stylesheet defines the tokens the seed components use. The home page is checked because every
  // page links the same stylesheet. The seed cards appear only when albums are published, so no marker is required.
  if (page === 'dist/index.html') {
    const stylesheetFile = linkTags
      .filter((tag) => /\brel="stylesheet"/u.test(tag))
      .map((tag) => siteUrl(decodeAttr(attr(tag, 'href') ?? '')))
      .map((url) => (url ? distFileFor(url) : null))
      .find((file) => file !== null);
    expect(stylesheetFile !== undefined, 'dist/index.html must link a stylesheet that exists in dist/');
    const css = stylesheetFile ? readFileSync(stylesheetFile, 'utf8') : '';
    for (const token of SHADCN_TOKENS) {
      expect(css.includes(`--${token}:`), `linked stylesheet is missing the shadcn token --${token}`);
    }
    expect(css.includes('.bg-card{'), 'linked stylesheet is missing the bg-card utility');
  }
}

// Album pages: each one renders its grid with the data the client script reads, and the image dialog. Every album link
// on the home page must resolve to a built album page. Album pages are built only for albums the index published.
const albumPages = htmlFiles.filter((file) => relative(dist, file).split(sep).join('/').startsWith('albums/'));
const homeFile = join(dist, 'index.html');
if (fileExists(homeFile)) {
  const homeLinks = [...readFileSync(homeFile, 'utf8').matchAll(/<a\b[^>]*\shref="(\/albums\/[^"]*)"/giu)].map((match) => decodeAttr(match[1]));
  for (const href of homeLinks) {
    const url = siteUrl(href);
    expect(url !== null && distFileFor(url) !== null, `dist/index.html links to an album page missing from dist/: ${href}`);
  }
  // The sky and the album wall each link every album, so the distinct targets are what is counted.
  const distinctLinks = new Set(homeLinks);
  expect(distinctLinks.size === albumPages.length, `dist/index.html links ${distinctLinks.size} albums but dist/albums/ has ${albumPages.length} pages`);
}
for (const file of albumPages) {
  const page = `dist/${relative(dist, file).split(sep).join('/')}`;
  const html = readFileSync(file, 'utf8');
  const items = html.match(/<a\b[^>]*class="gallery-item"[^>]*>/giu) ?? [];
  // An album whose index lists no image shows its count and no grid.
  expect(
    items.length === 0 ? /\b0 images\b/u.test(html) : html.includes('data-gallery-grid'),
    `${page} must render the image grid, or the zero-image count when it lists no image`,
  );
  expect(html.includes('data-gallery-dialog'), `${page} must render the image dialog`);
  // The viewer shell: stage, both arrows, close, and the details panel the script drives.
  for (const marker of ['data-viewer-stage', 'data-dialog-previous', 'data-dialog-next', 'data-dialog-close', 'data-viewer-panel']) {
    expect(html.includes(marker), `${page} viewer is missing ${marker}`);
  }
  for (const item of items) {
    expect(/\sdata-key="[^"]+"/u.test(item) && /\saria-label="[^"]+"/u.test(item), `${page} grid item lacks data-key or an accessible name: ${item}`);
  }
}

// Scroll-driven animations must not be folded into the `animation` shorthand: browsers that do not read animation-timeline
// there drop the whole declaration, and the effect disappears without an error.
for (const file of filesUnder(join(dist, '_astro')).filter((candidate) => candidate.endsWith('.css'))) {
  expect(
    !/animation:[^;}]*scroll\(/u.test(readFileSync(file, 'utf8')),
    `${relative(root, file)} folds animation-timeline into the animation shorthand; write the longhands`,
  );
}

// Discovery files produced by Hagilight.
for (const file of DISCOVERY_FILES) {
  expect(fileExists(join(dist, file)), `dist/${file} is missing`);
}
const robotsPath = join(dist, 'robots.txt');
if (fileExists(robotsPath)) {
  expect(
    readFileSync(robotsPath, 'utf8').includes(`Sitemap: ${SITE_ORIGIN}/sitemap-index.xml`),
    `dist/robots.txt must reference ${SITE_ORIGIN}/sitemap-index.xml`,
  );
}
const metadataPath = join(dist, '.well-known', 'hagilight.metadata.json');
if (fileExists(metadataPath)) {
  const metadata = readJson(metadataPath);
  expect(
    metadata.site?.url?.replace(/\/$/u, '') === SITE_URL,
    `metadata site url must be ${SITE_URL}, found ${metadata.site?.url}`,
  );
  expect(metadata.site?.name === SITE_NAME, `metadata site name must be "${SITE_NAME}", found "${metadata.site?.name}"`);
  expect(metadata.generator?.version === hagilightVersion, `metadata generator version must be ${hagilightVersion}, found ${metadata.generator?.version}`);
}

// public/ holds none of the files Hagilight generates or ships.
for (const file of FORBIDDEN_PUBLIC_FILES) {
  expect(!existsSync(join(root, 'public', file)), `public/${file} must not exist; Hagilight generates or ships it`);
}

// Source checks: no copied Hagilight package source, no selector that targets the Hagilight footer, and no client directive.
const sourceFiles = [
  ...filesUnder(join(root, 'src')),
  ...filesUnder(join(root, 'public')),
  ...filesUnder(join(root, 'scripts')),
  ...['astro.config.mjs', 'tsconfig.json', 'components.json'].map((file) => join(root, file)).filter(fileExists),
].filter((file) => file !== fileURLToPath(import.meta.url));
for (const file of sourceFiles) {
  const path = relative(root, file).split(sep).join('/');
  const text = readFileSync(file, 'utf8');
  for (const marker of HAGILIGHT_SOURCE_MARKERS) {
    expect(!text.includes(marker), `${path} contains Hagilight package source ("${marker}"); consume the package instead of copying it`);
  }
  if (path.startsWith('src/')) {
    expect(!HAGILIGHT_FOOTER_SELECTOR.test(text), `${path} targets the Hagilight footer; the footer must not be restyled`);
    expect(!CLIENT_DIRECTIVE.test(text), `${path} uses a client:* directive; seed components must render as static HTML`);
  }
}
// The markers must still exist in the installed packages, or the source check above checks nothing.
const installedText = HAGILIGHT_PACKAGES.flatMap((name) => filesUnder(join(root, 'node_modules', name), new Set())
  .filter((file) => /\.(?:js|mjs|astro|ts)$/u.test(file)))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');
for (const marker of HAGILIGHT_SOURCE_MARKERS) {
  expect(installedText.includes(marker), `Hagilight source marker "${marker}" is not in the installed packages; update HAGILIGHT_SOURCE_MARKERS`);
}

if (failures.length > 0) {
  console.error('verify-foundation: failed');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`verify-foundation: ok (hagilight@${hagilightVersion}, ${SITE_URL})`);
