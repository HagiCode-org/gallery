import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Values copied from repos/fullstack/components.json. The gallery is a separate repository, so the test pins them
// here instead of reading the sibling checkout, which CI does not have.
const PINNED_CONFIG = {
  style: 'radix-nova',
  rsc: false,
  tsx: true,
  tailwind: { config: '', css: 'src/styles/global.css', baseColor: 'neutral', cssVariables: true, prefix: '' },
  iconLibrary: 'lucide',
  aliases: {
    components: '@/components',
    utils: '@/lib/utils',
    ui: '@/components/ui',
    lib: '@/lib',
    hooks: '@/hooks',
  },
  menuColor: 'default',
  menuAccent: 'bold',
};

const SEED_COMPONENTS = ['button', 'card', 'badge', 'separator'];
const SEED_DIR = 'src/components/ui';
const UTILS_PATH = 'src/lib/utils.ts';
const GLOBAL_CSS = 'src/styles/global.css';

// Colour tokens from the shadcn set. Each must be defined for light and dark, and bridged into @theme inline.
const COLOR_TOKENS = [
  'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
  'accent', 'accent-foreground', 'destructive', 'border', 'input', 'ring',
];
const TOKENS = [...COLOR_TOKENS, 'radius'];

// Element rules that must sit inside @layer base, so a utility class always beats them.
const BASE_RULES = ['body', 'h1', 'p', 'a', ':focus-visible'];

// Index of the brace that closes the block opened at `open`.
function closingBrace(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

// The first block whose header appears at or after `from`, as its start, end and inner body. Null when absent.
function blockAfter(text, header, from = 0) {
  const start = text.indexOf(header, from);
  if (start === -1) return null;
  const open = text.indexOf('{', start);
  const close = closingBrace(text, open);
  return { start, end: close + 1, body: text.slice(open + 1, close) };
}

// Declarations inside a block body as a map of custom property name to value.
function declarations(body) {
  return new Map([...body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gu)].map(([, name, value]) => [name, value.trim()]));
}

// Package name of a bare import specifier, such as `radix-ui` or `@scope/name/sub`.
function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

// WCAG 2.x relative luminance of a #rrggbb or #rgb colour.
function luminance(hex) {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255);
  const linear = (channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

// Collects the failures for the shadcn foundation under `base`. Returns a list of messages naming each item.
export async function collectFailures(base, { manifest } = {}) {
  const failures = [];
  const readText = (file) => readFile(path.join(base, file), 'utf8');

  const config = JSON.parse(await readText('components.json'));
  for (const [key, expected] of Object.entries(PINNED_CONFIG)) {
    if (key === 'aliases' || key === 'tailwind') continue;
    if (JSON.stringify(config[key]) !== JSON.stringify(expected)) {
      failures.push(`components.json ${key} must be ${JSON.stringify(expected)}, found ${JSON.stringify(config[key])}`);
    }
  }
  for (const [key, expected] of Object.entries(PINNED_CONFIG.tailwind)) {
    if (JSON.stringify(config.tailwind?.[key]) !== JSON.stringify(expected)) {
      failures.push(`components.json tailwind.${key} must be ${JSON.stringify(expected)}, found ${JSON.stringify(config.tailwind?.[key])}`);
    }
  }
  for (const [key, expected] of Object.entries(PINNED_CONFIG.aliases)) {
    if (config.aliases?.[key] !== expected) {
      failures.push(`components.json alias ${key} must be ${expected}, found ${config.aliases?.[key]}`);
    }
  }

  const tsconfig = JSON.parse(await readText('tsconfig.json'));
  if (tsconfig.compilerOptions?.paths?.['@/*']?.[0] !== './src/*') {
    failures.push('tsconfig.json must map "@/*" to "./src/*" so the components aliases resolve inside src/');
  }

  const pkg = manifest ?? JSON.parse(await readText('package.json'));
  const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  for (const name of ['@hagicode/hagilight', '@hagicode/hagilight-core']) {
    if (!pkg.dependencies?.[name]) failures.push(`package.json must keep ${name} pinned in dependencies`);
  }

  let utilsSource = null;
  try {
    utilsSource = await readText(UTILS_PATH);
  } catch {
    failures.push(`${UTILS_PATH} is missing; the cn() helper must exist at the utils alias`);
  }
  if (utilsSource !== null && !/export\s+function\s+cn\b/u.test(utilsSource)) {
    failures.push(`${UTILS_PATH} must export cn()`);
  }

  for (const component of SEED_COMPONENTS) {
    const file = `${SEED_DIR}/${component}.tsx`;
    let source;
    try {
      source = await readText(file);
    } catch {
      failures.push(`seed component ${component} is missing: ${file}`);
      continue;
    }
    if (!/from\s+["']@\/lib\/utils["']/u.test(source)) {
      failures.push(`seed component ${component} must import cn through "@/lib/utils"`);
    }
    if (/from\s+["']cn["']/u.test(source)) {
      failures.push(`seed component ${component} must not import cn from the npm package "cn"`);
    }
    if (/from\s+["'](?:\.\.?\/)+(?:[^"']*\/)?lib\/utils["']/u.test(source)) {
      failures.push(`seed component ${component} must not reach the helper through a relative path`);
    }
    if (/(?<![\w-])shadow(?:-[\w[\]/.%-]+)?(?![\w-])/u.test(source)) {
      failures.push(`seed component ${component} must not apply a box shadow`);
    }
    if (/#[0-9a-fA-F]{3,8}\b|\boklch\(|\brgba?\(|\bhsla?\(/u.test(source)) {
      failures.push(`seed component ${component} must take colour from tokens, not a colour literal`);
    }
    for (const [, specifier] of source.matchAll(/from\s+["']([^"']+)["']/gu)) {
      if (specifier.startsWith('.') || specifier.startsWith('@/')) continue;
      const name = packageName(specifier);
      if (!declared.has(name)) {
        failures.push(`seed component ${component} imports "${name}", which is not declared in package.json`);
      }
    }
  }

  let css = null;
  try {
    css = await readText(GLOBAL_CSS);
  } catch {
    failures.push(`${GLOBAL_CSS} is missing`);
  }
  if (css !== null) {
    const rootLight = blockAfter(css, ':root {')?.body ?? '';
    const darkAttribute = blockAfter(css, ':root[data-theme="dark"] {');
    const darkMedia = darkAttribute && blockAfter(css, '@media (prefers-color-scheme: dark) {', darkAttribute.end);
    const darkFallback = darkMedia && blockAfter(darkMedia.body, ':root:not([data-theme]) {');
    const themeInline = blockAfter(css, '@theme inline {')?.body ?? '';
    const layer = blockAfter(css, '@layer base {');

    const light = declarations(rootLight);
    const dark = declarations(darkAttribute?.body ?? '');
    const fallback = declarations(darkFallback?.body ?? '');

    if (!darkAttribute) failures.push(`${GLOBAL_CSS} must define the dark tokens under :root[data-theme="dark"]`);
    if (!darkFallback) failures.push(`${GLOBAL_CSS} must define the dark tokens in the prefers-color-scheme fallback for :root:not([data-theme])`);

    for (const token of TOKENS) {
      if (!light.has(token)) failures.push(`${GLOBAL_CSS} must define the light token --${token} on :root`);
    }
    for (const token of COLOR_TOKENS) {
      if (!dark.has(token)) failures.push(`${GLOBAL_CSS} must define the dark token --${token} under :root[data-theme="dark"]`);
      if (!fallback.has(token)) failures.push(`${GLOBAL_CSS} must define the dark token --${token} in the prefers-color-scheme fallback`);
      if (!new RegExp(`--color-${token}:\\s*var\\(--${token}\\)`, 'u').test(themeInline)) {
        failures.push(`${GLOBAL_CSS} must bridge --${token} into @theme inline as --color-${token}`);
      }
    }
    for (const token of COLOR_TOKENS) {
      if (dark.get(token) !== fallback.get(token)) {
        failures.push(`${GLOBAL_CSS} dark --${token} differs between the data-theme block and the fallback`);
      }
    }
    if (dark.size !== fallback.size) {
      failures.push(`${GLOBAL_CSS} dark declaration lists differ in length (${dark.size} and ${fallback.size})`);
    }

    if (!layer) {
      failures.push(`${GLOBAL_CSS} must keep its element rules inside @layer base`);
    } else {
      const outside = layer.start > 0 ? css.slice(0, layer.start) + css.slice(layer.end) : css.slice(layer.end);
      for (const rule of BASE_RULES) {
        const selector = new RegExp(`(^|[\\s,}])${rule.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s*[{,]`, 'mu');
        if (!selector.test(layer.body)) {
          failures.push(`${GLOBAL_CSS} must define the element rule "${rule}" inside @layer base`);
        }
        if (selector.test(outside)) {
          failures.push(`${GLOBAL_CSS} defines the element rule "${rule}" outside @layer base`);
        }
      }
    }

    if (/@font-face/u.test(css)) {
      failures.push(`${GLOBAL_CSS} must not declare a web font with @font-face`);
    }

    const contrastPairs = [
      ['foreground', 'background'],
      ['foreground', 'card'],
      ['muted-foreground', 'background'],
      ['muted-foreground', 'card'],
      ['primary-foreground', 'primary'],
    ];
    for (const [label, values] of [['light', light], ['dark', dark]]) {
      for (const [text, surface] of contrastPairs) {
        const ratio = contrastRatio(values.get(text), values.get(surface));
        if (ratio < 4.5) {
          failures.push(`${label} --${text} on --${surface} is ${ratio.toFixed(2)}:1, below WCAG AA 4.5:1`);
        }
      }
    }
  }

  return failures;
}

// Copies the foundation files into a temporary directory so a test can break one item without touching the repository.
async function copyFoundation() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shadcn-foundation-'));
  for (const file of ['components.json', 'package.json', 'tsconfig.json', UTILS_PATH, GLOBAL_CSS]) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await cp(path.join(root, file), path.join(dir, file));
  }
  await cp(path.join(root, SEED_DIR), path.join(dir, SEED_DIR), { recursive: true });
  return dir;
}

describe('contrast helper', () => {
  it('reports the WCAG ratio for black on white as 21:1', () => {
    assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  });
});

describe('shadcn foundation in the repository', () => {
  it('passes every check on the current files', async () => {
    assert.deepEqual(await collectFailures(root), []);
  });

  it('keeps every seed component file present', async () => {
    const files = await readdir(path.join(root, SEED_DIR));
    for (const component of SEED_COMPONENTS) {
      assert.ok(files.includes(`${component}.tsx`), `${component}.tsx is missing from ${SEED_DIR}`);
    }
  });

  it('names a seed import that the manifest does not declare', async () => {
    const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    delete manifest.dependencies['radix-ui'];
    const failures = await collectFailures(root, { manifest });
    assert.ok(
      failures.some((message) => message.includes('"radix-ui"') && message.includes('not declared in package.json')),
      `expected a failure naming radix-ui, got: ${failures.join('; ')}`,
    );
  });
});

describe('shadcn foundation guard catches breakage', () => {
  it('names a deleted seed component', async () => {
    const dir = await copyFoundation();
    try {
      await rm(path.join(dir, SEED_DIR, 'card.tsx'));
      const failures = await collectFailures(dir);
      assert.ok(failures.some((message) => message.includes('seed component card is missing')), failures.join('; '));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('names a seed component that imports cn from the npm package', async () => {
    const dir = await copyFoundation();
    try {
      const file = path.join(dir, SEED_DIR, 'badge.tsx');
      const source = await readFile(file, 'utf8');
      await writeFile(file, source.replace('from "@/lib/utils"', 'from "cn"'));
      const failures = await collectFailures(dir);
      assert.ok(failures.some((message) => message.includes('badge') && message.includes('npm package "cn"')), failures.join('; '));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('names a seed component that applies a box shadow', async () => {
    const dir = await copyFoundation();
    try {
      const file = path.join(dir, SEED_DIR, 'card.tsx');
      const source = await readFile(file, 'utf8');
      await writeFile(file, source.replace('rounded-xl bg-card', 'rounded-xl bg-card shadow-md'));
      const failures = await collectFailures(dir);
      assert.ok(failures.some((message) => message.includes('card') && message.includes('box shadow')), failures.join('; '));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('names a colour literal in a seed component', async () => {
    const dir = await copyFoundation();
    try {
      const file = path.join(dir, SEED_DIR, 'separator.tsx');
      const source = await readFile(file, 'utf8');
      await writeFile(file, source.replace('bg-border', 'bg-[#8fb0ff]'));
      const failures = await collectFailures(dir);
      assert.ok(failures.some((message) => message.includes('separator') && message.includes('colour literal')), failures.join('; '));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('names a token removed from the dark set', async () => {
    const dir = await copyFoundation();
    try {
      const file = path.join(dir, GLOBAL_CSS);
      const css = await readFile(file, 'utf8');
      const attribute = css.indexOf(':root[data-theme="dark"] {');
      const edited = css.slice(0, attribute) + css.slice(attribute).replace(/\n\s*--card-foreground: #e5ebf5;/u, '');
      await writeFile(file, edited);
      const failures = await collectFailures(dir);
      assert.ok(failures.some((message) => message.includes('--card-foreground') && message.includes('data-theme')), failures.join('; '));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('names a token removed from the prefers-color-scheme fallback', async () => {
    const dir = await copyFoundation();
    try {
      const file = path.join(dir, GLOBAL_CSS);
      const css = await readFile(file, 'utf8');
      const fallback = css.indexOf(':root:not([data-theme]) {');
      const edited = css.slice(0, fallback) + css.slice(fallback).replace(/\n\s*--card-foreground: #e5ebf5;/u, '');
      await writeFile(file, edited);
      const failures = await collectFailures(dir);
      assert.ok(failures.some((message) => message.includes('--card-foreground') && message.includes('fallback')), failures.join('; '));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('names a dark value that differs between the two dark lists', async () => {
    const dir = await copyFoundation();
    try {
      const file = path.join(dir, GLOBAL_CSS);
      const css = await readFile(file, 'utf8');
      const fallback = css.indexOf(':root:not([data-theme]) {');
      const edited = css.slice(0, fallback) + css.slice(fallback).replace('--primary: #8fb0ff;', '--primary: #8fb0fe;');
      await writeFile(file, edited);
      const failures = await collectFailures(dir);
      assert.ok(failures.some((message) => message.includes('--primary') && message.includes('differs')), failures.join('; '));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('names a text pairing that falls below AA contrast', async () => {
    const dir = await copyFoundation();
    try {
      const file = path.join(dir, GLOBAL_CSS);
      const css = await readFile(file, 'utf8');
      await writeFile(file, css.replace('--muted-foreground: #526174;', '--muted-foreground: #b0bccb;'));
      const failures = await collectFailures(dir);
      assert.ok(failures.some((message) => message.includes('light --muted-foreground') && message.includes('AA')), failures.join('; '));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('names a base rule moved outside the base layer', async () => {
    const dir = await copyFoundation();
    try {
      const file = path.join(dir, GLOBAL_CSS);
      const css = await readFile(file, 'utf8');
      await writeFile(file, css.replace('@layer base {', '{'));
      const failures = await collectFailures(dir);
      assert.ok(failures.some((message) => message.includes('@layer base')), failures.join('; '));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
