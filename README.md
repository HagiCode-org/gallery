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
| `npm run i18n:check` | Audit the YAML locale files with hagi18n (`audit` and `doctor`) |
| `npm run i18n:generate` | Generate `src/i18n/generated/` from the YAML (the other scripts run it for you) |
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
pages are static HTML. The client scripts are plain modules: the header's theme and language controls
(`src/scripts/site-controls.ts`, see [Languages and theme](#languages-and-theme)) and the album script described under
[Client script](#client-script). Every thumbnail is a link to its image file, so the album pages work with JavaScript
disabled.

## Albums and data source

An album is one published R2 prefix of `img-gen`. The albums are listed in `src/config/albums.ts`, together with
`IMAGE_BASE_URL` (`https://img-gen.hagicode.com`), which is the only place the public host and a prefix appear. Each
album has a URL slug and an R2 prefix; its name and description are per-language text in `albums.yml` (see [Languages and theme](#languages-and-theme)). Slugs and prefixes are unique, and the configuration
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
  a time, with `credentials: 'omit'` and `cache: 'reload'` (a plain `<img>` load leaves a copy without CORS headers
  in the browser's HTTP cache, which a normal `fetch` would reuse and be blocked by). Only a successful response whose size matches the index is stored. Other
  outcomes leave the cache unchanged and raise no error.
- **Pruning.** Once per page load, every cache whose name starts with `hagicode-gallery-` and is not a current name is
  deleted. Caches of other applications on the origin are kept.
- **Metadata.** A cached copy is shown at once and refreshed in the background. The copy is replaced only by a valid
  version 1 body.
- **CORS requirement.** Storing a copy means the browser fetches it, so `img-gen.hagicode.com` must send
  `Access-Control-Allow-Origin` for `https://gallery.hagicode.com`. The Cloudflare rule `https://*.hagicode.com` provides
  this (set 2026-10-21). If the rule is removed, writes fail silently and the image dialog shows its "could not be
  loaded" notice for metadata, while images still display from their own URLs. The probe is recorded at the top of
  `src/config/albums.ts`.

## Languages and theme

The site ships in the ten languages Hagilight's footer knows: `en-US` (default, at the root), `zh-CN`, `zh-Hant`,
`ja-JP`, `ko-KR`, `de-DE`, `fr-FR`, `es-ES`, `pt-BR` and `ru-RU`. The list is `SUPPORTED_LOCALES` in `src/config/site.ts`
and the Astro `i18n` block reads it. Every other language lives under `/<locale>/`, for example `/ja-JP/albums/hero-avatars/`,
so a build holds ten copies of the home page and of each published album page.

- **Strings.** The source is YAML: `src/i18n/locales/<locale>/ui.yml` (interface text) and `albums.yml` (album names and
  descriptions, keyed by album slug), maintained with [`@hagicode/hagi18n`](../hagi18n) through `hagi18n.yaml`.
  `scripts/generate-i18n-resources.mjs` turns them into JSON under `src/i18n/generated/` (git-ignored), which the site
  imports; `dev`, `build`, `check` and `test` run it first. The viewer script's strings travel on the dialog as
  `data-messages` JSON, written at build time. Counts use the language's CLDR plural forms through `Intl.PluralRules`, so
  every catalog defines `one`, `few`, `many` and `other` (a language that does not tell them apart repeats the text) with
  a `{{n}}` placeholder.
- **Adding or changing text.** Edit `en-US` first, then run `npm run i18n:sync` to see what the other nine are missing
  (`i18n:sync:write` fills them with English copies, which must then be translated). Adding an album means one entry in
  `src/config/albums.ts` and one per language in `albums.yml`; `scripts/__tests__/i18n.test.mjs` fails until they match.
- **Checking.** `npm run i18n:check` runs `hagi18n audit` and `doctor` (missing or extra keys, placeholder mismatches,
  values identical to English). Values that are meant to match English (loanwords such as "Album", the byte unit) are
  listed in `auditIdenticalAllowlist` in `hagi18n.yaml`. The published hagi18n 0.2.0 reads that list without applying it,
  so `scripts/i18n-audit.mjs` applies it and fails on anything else; CI runs the check before the type check.
- **Language menu.** A `<details>` list of plain links in the header. Each link points at the same page in another
  language, so it works without JavaScript. Pages carry `hreflang` alternates (with `x-default`) and `og:locale`; the
  footer, sitemap and per-language RSS feeds come from Hagilight.
- **404.** `404.html` is one file for every missing address, so it renders the notice in all ten languages and a small
  script shows the one the address carries (`/ko-KR/missing/` shows Korean). The footer on that page stays English.
- **Theme.** Three choices in the header: system, light, dark. Light and dark set `data-theme` on `<html>` and store the
  choice under `starlight-theme`, the key the other HagiCode sites use; system removes both and the
  `prefers-color-scheme` rules decide. An inline script in the head applies the stored choice before first paint, and a
  change in another tab is followed through the `storage` event. The toggle is hidden until its script runs.

## Client script

`src/scripts/gallery-client.ts` is a plain module loaded by `ImageGrid.astro` and `index.astro`. It is not an island:
it has no `client:*` directive and no hydration script. It upgrades sprite sheets and visible lazy images to cached
copies (queueing misses for deferred storage) and starts two modules:

- `src/scripts/grid-motion.ts`: the pointer spotlight, the develop-on-load fade of thumbnails (tied to the real image load, so it costs nothing on a
  long album), the
  S / M / L thumbnail-size control (remembered in `localStorage`, keeping the middle of the screen in place) and the
  `001 – 016 / 720` range readout in the album bar;
- `src/scripts/viewer.ts`: the image viewer, described below.

Every part is an enhancement over markup that already works, and steps aside for `prefers-reduced-motion` or a missing
browser feature.

`src/scripts/sky.ts` is a second plain module, loaded by `index.astro` only. It animates the home page's hero, a night sky
with one star per album. The build places each star (`src/lib/gallery/constellation.ts`, pure geometry, same result on
every build) and the page is complete without script: every star is a link to its album, with the covers and the small
pictures around it taken from the album's own index. With script, the stars drift and lean toward a fine pointer, a
canvas draws the lines between neighbouring albums, and the album in play (hover or keyboard focus) lights its lines and
sends a pulse along them. Frames run only while the sky is on screen and the tab is visible. With
`prefers-reduced-motion` nothing moves; the canvas is drawn once and again when an album is lit.

### The viewer

A click on a thumbnail opens the native `<dialog>` as a full-screen viewer; without script the thumbnail still links to
the image file.

- **Morph.** Where View Transitions exist, the clicked thumbnail travels into the picture and back on close (Escape, the
  close button, a swipe down and Back all take the same road). Without them the viewer fades in.
- **Ambient light.** The picture on show, blurred and dimmed, fills the room behind it and cross-fades between images.
- **Zoom and pan.** Wheel or trackpad pinch zooms around the cursor, `+` `-` `0` and the zoom button step it, double
  click or double tap toggles 2.5x, a drag pans, and two fingers pinch. The geometry is pure and tested in
  `src/lib/viewer/transform.ts`.
- **Swipe.** At rest scale a one-finger drag sideways moves one image (the picture follows the finger), and a drag down
  closes. Arrow keys, Home, End and the previous and next buttons do the same.
- **Details.** The `i` key or the info button opens a side panel (a bottom sheet on a narrow screen) with the key, pixel
  and byte size, both prompts with copy buttons, the seed and the generation time. The metadata is still requested only
  when the viewer opens. The panel state is remembered.
- **Fragment.** The URL fragment `#<key>` stays in step: opening pushes it, moving replaces it, closing removes it, and
  Back closes the viewer. A known fragment on load opens its image, and an unknown one is ignored.
- **Focus.** Closing returns focus to the thumbnail of the image that was last on show, which is where the page has
  scrolled to.

The next and previous pictures are fetched ahead as plain images, so an arrow key never waits on the network. Prompt
text is written with `textContent`, never as markup.

Between pages, `@view-transition { navigation: auto }` morphs an album's cover from the home page into the album
header and back. That is CSS only, and browsers without cross-document View Transitions navigate normally.

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

- One blue for links, actions and focus. Colour comes from the shadcn tokens; `gallery.css` adds a palette only for the
  viewer, because a picture is judged in a dark room whatever the page theme is.
- Seed components in `src/components/ui/` apply no box shadow. In `gallery.css` a shadow marks only a lifted picture (a
  hovered thumbnail, the album stack, the album cover, the viewer's picture), always with an offset and a blur.
- The pictures lead. The page chrome is quiet: no cards around thumbnails, keys on a scrim over the picture, one `h1` per
  page (the site name in the top bar is a link, not a heading).
- Motion has one authored moment per surface: the wall rising on the home page, the thumbnail morphing into the viewer.
  Everything else is a short transition. Curves are `--ease-out` and `--spring` in `global.css`.
- A native system font stack. No web font is loaded; `scripts/__tests__/shadcn-foundation.test.mjs` enforces it.
- Scroll-driven animations are written as longhands (`animation-name`, `animation-timeline`, ...). The minifier folds a
  complete `animation` shorthand into one declaration that some browsers drop, which silently removes the effect;
  `scripts/verify-foundation.mjs` checks the built CSS for it.
- Hover effects sit behind `(hover: hover) and (pointer: fine)`; reduced motion switches every animation and transition
  off.
- Lucide icons at 16 px in the shadcn components, and one authored 24-unit, 1.75-stroke icon set in the viewer, hidden from
  assistive technology when decorative.
- `min-w-0` on flex and grid children, so long labels wrap at 360 px.

The theme follows `prefers-color-scheme`. There is no theme toggle.

## Project layout

```text
astro.config.mjs            site URL, ten-locale i18n, React, Tailwind, Hagilight integrations
components.json             shadcn CLI configuration
src/config/site.ts          site name, description, URL, locales (single source)
src/layouts/BaseLayout.astro  the one <head> (SEOHead with favicon) and the one Footer
src/config/albums.ts        image base URL and the album list (the one definition of both)
src/pages/index.astro       English home page; src/pages/[locale]/ holds the other nine languages' routes
src/pages/albums/[album].astro  one static page per published album (English)
src/components/pages/       HomePage (the sky hero, then album cards or the empty state) and AlbumPage, shared by all routes
src/components/site/        header: SiteHeader, LanguageMenu, ThemeToggle
src/i18n/locales.ts         locale helpers (paths, plural counts, labels)
src/i18n/messages/          the message type and the loader of the generated catalogs
src/i18n/albums.ts          loader of the per-language album text
src/i18n/locales/           YAML sources per language: ui.yml and albums.yml (hagi18n)
src/i18n/generated/         JSON built from the YAML (git-ignored)
hagi18n.yaml                hagi18n configuration for the locale tree
src/components/gallery/     AlbumCard (fanned stack), Thumb, ImageGrid and ImageDialog (the viewer's markup)
src/components/ui/          shadcn components (added by the CLI only)
src/lib/gallery/            build time: index schema, index fetch with retries, album loader, thumbnail geometry, sky layout
src/lib/image-cache/        browser: Cache API helpers and the metadata loader (imports nothing from Astro)
src/lib/viewer/transform.ts browser, pure: zoom, pan, pinch and swipe geometry
src/scripts/site-controls.ts   header: theme choice and language menu
src/scripts/gallery-client.ts  the plain client module for album pages (cache upgrades; starts the two below)
src/scripts/grid-motion.ts  spotlight, develop-on-load fade, thumbnail size, range readout
src/scripts/viewer.ts       the image viewer (morph, zoom, swipe, details panel, fragment)
src/scripts/sky.ts          the home hero: drift, pointer lean, constellation canvas, lit-album pulse
src/styles/global.css       Tailwind, shadcn tokens for light and dark, base layer, motion curves
src/styles/gallery.css      the album wall, the album page and the viewer
src/styles/sky.css          the home hero and the album list's heading row
src/lib/theme.ts            theme choice and its storage key
src/lib/utils.ts            cn() helper
scripts/generate-i18n-resources.mjs   YAML locale tree to JSON
scripts/i18n-audit.mjs      hagi18n audit and doctor with the identical-value allowlist applied
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
