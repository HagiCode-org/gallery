// Turns the YAML locale tree (src/i18n/locales, maintained with hagi18n) into the JSON the site imports
// (src/i18n/generated, git-ignored). Every npm script that builds, checks or tests the site runs it first.
//
//   node scripts/generate-i18n-resources.mjs
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load } from 'js-yaml';

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../src/config/site.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(root, 'src', 'i18n', 'locales');
const generatedRoot = join(root, 'src', 'i18n', 'generated');

const names = (directory) => readdirSync(directory).sort();
const same = (left, right, message) => {
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(`${message}: ${right.join(', ')} (expected ${left.join(', ')})`);
};

// Every locale directory must be a supported locale and hold the same files as the default one.
same([...SUPPORTED_LOCALES].sort(), names(sourceRoot), 'src/i18n/locales must hold exactly the supported locales');
const namespaces = names(join(sourceRoot, DEFAULT_LOCALE)).map((file) => file.replace(/\.ya?ml$/u, ''));

const output = new Map();
for (const locale of SUPPORTED_LOCALES) {
  same(namespaces.map((name) => `${name}.yml`), names(join(sourceRoot, locale)), `${locale} must hold the same files as ${DEFAULT_LOCALE}`);
  for (const namespace of namespaces) {
    const data = load(readFileSync(join(sourceRoot, locale, `${namespace}.yml`), 'utf8'));
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error(`${locale}/${namespace}.yml must be a top-level mapping`);
    }
    output.set(join(generatedRoot, locale, `${namespace}.json`), `${JSON.stringify(data, null, 2)}\n`);
  }
}

rmSync(generatedRoot, { recursive: true, force: true });
for (const [file, text] of output) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
}
console.log(`i18n resources: wrote ${output.size} files to src/i18n/generated`);
