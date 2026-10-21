// Runs `hagi18n audit` or `hagi18n doctor` and exits 1 on any finding that is not an allowed identical value.
//
// hagi18n.yaml lists the values that several languages share with English on purpose (auditIdenticalAllowlist). The
// published @hagicode/hagi18n 0.2.0 reads that key without applying it, so its own exit code is red for those values.
// This wrapper applies the list itself. It changes nothing once a hagi18n release applies the list: the findings it
// filters are then already gone.
//
//   node scripts/i18n-audit.mjs [audit|doctor]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load } from 'js-yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'audit';
if (mode !== 'audit' && mode !== 'doctor') {
  console.error(`i18n-audit: unknown mode "${mode}", expected audit or doctor`);
  process.exit(2);
}

const config = load(readFileSync(join(root, 'hagi18n.yaml'), 'utf8'));
const allowed = new Map(
  Object.entries(config.auditIdenticalAllowlist ?? {}).map(([file, keys]) => [file, new Set(keys)]),
);

const cli = join(root, 'node_modules', '@hagicode', 'hagi18n', 'dist', 'cli.js');
const run = spawnSync(process.execPath, [cli, mode, '--config', 'hagi18n.yaml', '--json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error(`i18n-audit: hagi18n ${mode} did not print JSON\n${run.stdout}${run.stderr}`);
  process.exit(1);
}

const audit = mode === 'doctor' ? report.audit : report;
const lines = [];
for (const result of audit.results) {
  for (const [category, entries] of Object.entries(result)) {
    if (category === 'locale' || !Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (category === 'baselineValueMatches' && allowed.get(entry.file)?.has(entry.path)) continue;
      lines.push(`${result.locale}: ${category}: ${typeof entry === 'string' ? entry : JSON.stringify(entry)}`);
    }
  }
}
for (const issue of mode === 'doctor' ? report.legacyReferenceIssues : []) {
  lines.push(`legacy locale reference: ${JSON.stringify(issue)}`);
}

if (lines.length > 0) {
  console.error(`i18n-audit: ${mode} found ${lines.length} issue(s)`);
  for (const line of lines) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(`i18n-audit: ${mode} ok (${audit.locales.length} locales against ${audit.baseLocale})`);
