# HagiCode Gallery

A static gallery site for HagiCode work, built with Astro and served as static files. The home page lists the published
image albums, and each album page shows its images as a grid. The images come from `img-gen`, which publishes each
recipe set to R2 with an `index.json` that the build reads.

## Requirements

- Node.js 24 or newer (`engines.node` is `>=24.0.0`)
- npm, with the committed `package-lock.json`

## Commands

Run every command from the repository root.

| Command | What it does |
| --- | --- |
| `npm ci` | Install dependencies from the lockfile |
| `npm run dev` | Start the development server on all interfaces |
| `npm run build` | Build the static site into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run check` | Run `astro check` and the TypeScript type check |
| `npm test` | Run the `node --test` suites in `scripts/__tests__/` |
| `npm run verify` | Build, then run `scripts/verify-foundation.mjs` against `dist/` |
| `npm run deploy:payload` | Stage the publication payload into `.deploy/gh-pages` (CI use) |
| `npm run deploy:warmup` | Warm the deployment domains after a publication (CI use) |

## Stack

- **Astro** for static output, with `@astrojs/react` so React components render to static HTML at build time.
- **shadcn/ui** (style `radix-nova`, neutral base colour, CSS variables, Lucide icons) on **Tailwind CSS 4** through
  `@tailwindcss/vite`.
- **Hagilight** (`@hagicode/hagilight` and `@hagicode/hagilight-core`) for the SEO head, footer, favicon, sitemap,
  `robots.txt`, RSS, `llms.txt` and site metadata.

No island ships. Components do not use a `client:*` directive, and no page contains `astro-island` or `hydrat`, so the
pages are static HTML. The one client script is the plain module described under [Client script](#client-script). Every
thumbnail is a link to its image file, so the album pages work with JavaScript disabled.

## Albums and data source

An album is one published R2 prefix of `img-gen`. The albums are listed in `src/config/albums.ts`, together with
`IMAGE_BASE_URL` (`https://img-gen.hagicode.com`), which is the only place the public host and a prefix appear. Each
album has a URL slug, an R2 prefix, a title and a description. Slugs and prefixes are unique, and the configuration
check fails on a duplicate. Adding an album before its first publish is safe: it is omitted until its index exists.

Each build requests `<base>/<prefix>/index.json` once per album and shares the result between the home page and the
album pages. The index must be version 1, and every object key must lie under its album's prefix:

- A `404` means the album is not published yet. The build omits it and prints one warning per album. A build with no
  published album still succeeds, and the home page shows its empty state.
- Any other failure, such as a network error, a 10-second timeout or an error status, is retried up to three times
  with a short delay. After the last attempt the build fails and names the album.
- A malformed index fails the build and names the album and the first bad field.

The build needs network access to `img-gen.hagicode.com`. Metadata objects (`<stem>.metadata.json`) are not read at
build time. The browser reads one when its image is opened.

## Image cache

Images, sprite sheets and metadata are kept in the browser's Cache API and nowhere else. No IndexedDB or web storage
is used. The constants are in `src/lib/image-cache/cache.ts`.

- **Names.** `hagicode-gallery-images-v1` for images and sprite sheets, `hagicode-gallery-metadata-v1` for metadata. A
  new version gets a new name.
- **Byte validation.** An entry is used only when the size stored with it equals the `bytes` the index gives for that
  object. A re-rendered image with the same file name is therefore a miss.
- **Read budget.** A read that is not done within 150 ms, a read that fails, and a browser without the Cache API are
  all misses. A miss leaves the plain image URL in place, so the cache never hides an image.
- **Deferred writes.** A missed object is downloaded only after the page's `load` event and an idle period, four at
  a time, with `credentials: 'omit'`. Only a successful response whose size matches the index is stored. Other
  outcomes leave the cache unchanged and raise no error.
- **Pruning.** Once per page load, every cache whose name starts with `hagicode-gallery-` and is not a current name is
  deleted. Caches of other applications on the origin are kept.
- **Metadata.** A cached copy is shown at once and refreshed in the background. The copy is replaced only by a valid
  version 1 body.
- **CORS requirement.** Storing a copy means the browser fetches it, so `img-gen.hagicode.com` must send
  `Access-Control-Allow-Origin` for `https://gallery.hagicode.com`. On 2026-10-21 it did not, so until the R2 CORS
  rule changes, writes fail silently and the image dialog shows its "could not be loaded" notice for metadata. Images
  still display from their own URLs. The probe is recorded at the top of `src/config/albums.ts`.

## Client script

`src/scripts/gallery-client.ts` is a plain module loaded by `ImageGrid.astro` and `index.astro`. It is not an island:
it has no `client:*` directive and no hydration script. It does four things:

- upgrades sprite sheets and visible lazy images to cached copies, and queues misses for deferred storage;
- opens the native `<dialog>` for an unmodified click on a thumbnail, shows the image and its index facts, and loads
  the metadata only at that moment;
- moves between images with the previous and next controls and the arrow keys, and returns focus to the thumbnail on
  close;
- keeps the URL fragment `#<key>` in step: opening pushes it, moving replaces it, closing removes it, and Back closes the
  dialog. A known fragment on load opens its image, and an unknown one is ignored.

Prompt text is written with `textContent`, never as markup.

## Hagilight pinning and upgrades

Both Hagilight packages are pinned to the same exact version in `package.json` (currently `0.13.0`), with no range
operator. The reference sites use the same pin, so a shared fix arrives as one deliberate bump.

To upgrade, change both entries to the new exact version, run `npm install`, and run `npm run verify`. The
verification fails when the two packages differ, when a pin is a range, or when the installed copy does not match
the manifest. Do not copy Hagilight source into this repository.

## Adding shadcn components

Add components only through the shadcn CLI, with the configuration in `components.json`:

```bash
npx shadcn add <component>
```

Do not hand-edit the foundation files (`src/styles/global.css`, `src/lib/utils.ts`, `components.json`) to fit one
component. After adding a component, check that its `cn` import is `@/lib/utils`. The CLI can write a bare `cn`
package import, which the foundation test rejects. Then run `npm test` and `npm run verify`.

## Design rules

The gallery inherits the visual rules of the fullstack site until it has its own design document:

- One blue for links, actions and focus.
- Colour comes from tokens only. Components contain no hex, `oklch` or `rgb` literals.
- No box shadows. Surfaces are separated by a ring (`ring-1 ring-foreground/10`) or a border.
- A native system font stack. No web font is loaded.
- One `h1` per page. The site name in the top bar is a link, not a heading.
- Lucide icons at 16 px, hidden from assistive technology when decorative.
- Primary actions are full width below the `sm` breakpoint.
- `min-w-0` on flex and grid children, so long labels wrap at 360 px.

The theme follows `prefers-color-scheme`. There is no theme toggle.

## Project layout

```text
astro.config.mjs            site URL, one-locale i18n, React, Tailwind, Hagilight integrations
components.json             shadcn CLI configuration
src/config/site.ts          site name, description, URL, locales (single source)
src/layouts/BaseLayout.astro  the one <head> (SEOHead with favicon) and the one Footer
src/config/albums.ts        image base URL and the album list (the one definition of both)
src/pages/index.astro       home page: album cards or the empty state
src/pages/albums/[album].astro  one static page per published album
src/components/gallery/     AlbumCard, ImageGrid (grid and script) and ImageDialog (native dialog shell)
src/components/ui/          shadcn components (added by the CLI only)
src/lib/gallery/            build time: index schema, index fetch with retries, album loader, thumbnail geometry
src/lib/image-cache/        browser: Cache API helpers and the metadata loader (imports nothing from Astro)
src/scripts/gallery-client.ts  the one plain client module (cache upgrades, dialog, fragment)
src/styles/global.css       Tailwind, shadcn tokens for light and dark, base layer, gallery components
src/lib/utils.ts            cn() helper
scripts/verify-foundation.mjs      post-build checks on dist/
scripts/assemble-gh-pages-payload.mjs   stages the gh-pages payload
scripts/warm-deployment-domains.mjs     bounded-retry warmup of the live domains
scripts/__tests__/          node --test suites
.github/gh-pages/           Cloudflare static-asset contract files copied into the payload
.github/workflows/          gallery-ci.yml and gallery-deploy-gh-pages.yml
```

## Publication

GitHub Actions plus the `gh-pages` branch is the authoritative production path. No local command publishes to
production.

Two workflows implement it:

- `.github/workflows/gallery-ci.yml` runs on pull requests to `main` with a read-only token. It runs `npm ci`,
  `npm run check`, `npm test` and `npm run verify`.
- `.github/workflows/gallery-deploy-gh-pages.yml` runs on a push to `main` or on manual dispatch. Its `build` job
  has a read-only token. It runs `npm run verify` with the branch name passed to Hagilight, stages the payload, and
  uploads it with hidden files included. Its `deploy` job, which needs `build`, has write access to `contents` and
  runs in the `gallery-production` environment at `https://gallery.hagicode.com`. It publishes the payload to
  `gh-pages` as one orphan commit with Jekyll off, then warms the domains and writes a step summary. Runs are
  serialized and never cancelled mid-publication.

The payload root contains:

- `esa.jsonc` and `wrangler.jsonc`, the Cloudflare static-asset contract copied from `.github/gh-pages/`
- `dist/`, the built site, including dot-directories such as `dist/.well-known/hagilight.metadata.json`

The warmup domains are `gallery.472158246.workers.dev` and `gallery.hagicode.com`. The warmup makes up to four
attempts, three seconds apart, with a ten-second timeout per attempt. A `2xx` or `3xx` response counts as success.
If a domain stays unreachable, the warmup step fails and names the domain. The published snapshot is not rolled back.

A failed install, verification or staging step stops the run before the deploy job starts, so `gh-pages` is
unchanged.
