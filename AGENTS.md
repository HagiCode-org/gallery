# HagiCode Gallery Agent Configuration

## Root Configuration

Inherits all behavior from `/AGENTS.md` at the monorepo root. Local rules extend or override the root file for this repository.

## Project Context

`gallery` is the Astro static site at gallery.hagicode.com. It shows the image albums that the `img-gen` pipeline publishes: an album list, a grid per album, a full-screen viewer with a details panel, and shareable image links. The site has ten interface languages managed through `hagi18n`. The build reads the published albums, so it needs network access.

## Working Directory

Run commands from `repos/gallery/`.

## Key Commands

```bash
pnpm run dev                    # i18n generate, then astro dev --host 0.0.0.0
pnpm run build                  # i18n generate, then astro build
pnpm run check                  # i18n generate, astro check, tsc --noEmit
pnpm run verify                 # build, then scripts/verify-foundation.mjs
pnpm test                       # i18n generate, node --test scripts/__tests__/*.test.mjs, vitest run src
pnpm run i18n:check             # audit, doctor, generate and generate --check (run in CI)
pnpm run i18n:generate          # regenerate i18n resources from src/i18n
pnpm run check:registry         # registry neutrality (also run in CI)
```

The `i18n:sync`, `i18n:sync:write`, `i18n:prune` and `i18n:prune:write` scripts compare or change the locale files against `en-US`. Run the `:write` variants only when asked. Requires Node.js 24 or newer (`engines`).

## Key Paths

- `src/config/albums.ts`: the album list. `featuredOnHome` marks the agent and model albums that stand on the home page; `listBeforePublish` lists an album as "Images coming soon" before its first publish.
- `src/lib/gallery/homeThumbs.ts`: the home page thumbnails, cut to AVIF at build time.
- `src/lib/posthog-events.ts`, `src/scripts/viewer.ts`: the two analytics events and the viewer that sends them.
- `src/i18n/`: locale resources and the `locales/<locale>/` YAML files; `hagi18n.yaml` is the locale tool's config.
- `scripts/generate-i18n-resources.mjs`: generates the i18n resources; `--check` fails when they are stale.
- `PRODUCT.md`: product purpose and users. `DESIGN.md`: the visual design tokens and rules.
- `scripts/assemble-gh-pages-payload.mjs`, `scripts/warm-deployment-domains.mjs`, `.github/gh-pages/`: deployment.

## Conventions and Hard Rules

- The gallery shows only what `img-gen` has published. An unpublished album is left out until its first publish, unless it is marked `listBeforePublish`.
- Analytics: the viewer sends `gallery_image_opened` and `gallery_image_zoomed` only, and the only property is the album's public slug. Never send an image URL, file name, caption or prompt. Thumbnails carry no `data-ga-*` markers.
- Without PostHog, or after the visitor opts out, the viewer must behave the same and send nothing.
- Pages must work without JavaScript: every thumbnail links to its image file. Animation must respect reduced-motion settings.
- CI runs `pnpm run i18n:check` on every pull request; run it locally before pushing locale changes.
- Do not commit `package-lock.json`, `.env` files or a registry mirror URL.

## CI and Deployment

- `.github/workflows/gallery-ci.yml`: on pull requests to `main`. Runs a frozen-lockfile install, `check:registry`, `i18n:check`, `check`, `test` and `verify`.
- `.github/workflows/gallery-deploy-gh-pages.yml`: on push to `main`, on manual dispatch, and hourly at minute 17 (`17 * * * *`). It builds, verifies, assembles the gh-pages payload and warms the deployment domains.

## Package Management

- The repository uses pnpm, pinned in `package.json` `packageManager`. Run `corepack enable` once, then `pnpm install`. `pnpm-lock.yaml` is the only lockfile.
- Settings live in `pnpm-workspace.yaml`. `allowBuilds` lists the dependencies whose install scripts may run; review any new dependency with an install script and add it there.
- A local registry mirror belongs in `~/.npmrc` only. `pnpm run check:registry` fails on mirror hosts in tracked files.
- Undeclared imports fail under pnpm's strict layout: declare the package instead of hoisting it.

## References

- `README.md`
- `PRODUCT.md`, `DESIGN.md`
