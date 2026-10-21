// Stages the gh-pages publication payload: esa.jsonc, wrangler.jsonc, and the built dist/. Run after `npm run build`.
import { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_PAYLOAD_DIR = path.join(root, '.deploy', 'gh-pages');
const CONTRACT_DIR = path.join('.github', 'gh-pages');
const CONTRACT_FILES = ['esa.jsonc', 'wrangler.jsonc'];
const BUILD_ENTRY = path.join('dist', 'index.html');

// Lists every required input that is absent, so one run names all of them.
function findMissingInputs(sourceRoot) {
  const required = [...CONTRACT_FILES.map((file) => path.join(CONTRACT_DIR, file)), BUILD_ENTRY];
  return required.filter((relativePath) => !existsSync(path.join(sourceRoot, relativePath)));
}

export async function assembleGhPagesPayload({ sourceRoot = root, outputDir = DEFAULT_PAYLOAD_DIR } = {}) {
  // Check before removing anything, so a failed run leaves the previous payload in place.
  const missing = findMissingInputs(sourceRoot);
  if (missing.length > 0) {
    throw new Error(`Cannot assemble gh-pages payload, missing: ${missing.join(', ')}`);
  }

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  for (const file of CONTRACT_FILES) {
    await cp(path.join(sourceRoot, CONTRACT_DIR, file), path.join(outputDir, file));
  }
  await cp(path.join(sourceRoot, 'dist'), path.join(outputDir, 'dist'), { recursive: true });

  return outputDir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [outputArg] = process.argv.slice(2);
  assembleGhPagesPayload({ outputDir: outputArg ? path.resolve(outputArg) : DEFAULT_PAYLOAD_DIR })
    .then((outputDir) => {
      console.log(`Assembled gh-pages payload in ${outputDir}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
