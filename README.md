# HagiCode Gallery

A static gallery site for HagiCode work, built with Astro and served as static files. The current home page is a
placeholder that states the purpose and shows the shared shadcn/ui components. Gallery content is not added yet.

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

No client script ships. Components do not use a `client:*` directive, so pages work with JavaScript disabled.

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
src/pages/index.astro       home page
src/components/ui/          shadcn components (added by the CLI only)
src/styles/global.css       Tailwind, shadcn tokens for light and dark, base layer
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
