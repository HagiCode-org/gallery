# HagiCode Gallery

Pictures you can look at closely and see how they were made. HagiCode Gallery is the public site at
**[gallery.hagicode.com](https://gallery.hagicode.com)** where you can browse the image albums that HagiCode's `img-gen`
pipeline publishes.

## What you get

- **A home page of albums.** Each published album is listed with its name and description. The agent and model albums (`featuredOnHome` in `src/config/albums.ts`) stand in their own dark room under the sky, one panel each: on a mouse the open panel follows the pointer or keyboard focus, on touch the panels swipe. Every other album stays on the wall below. The pictures on the home page, and which model panel starts open, are drawn at random once per build and cut to small AVIF files (`src/lib/gallery/homeThumbs.ts`, written under `/_astro/`), so every visitor gets the same few small files until the next build.
  Selected agent and model albums take turns in the first spot on each visit or refresh once published. Agent CLI
  default cats stays in the regular album list. Covers, stacks and sky
  pictures are sampled from each album on every visit; the same cover appears in the sky and on its card.
  Every part of a model panel opens its album, pictures included, and every way into an album (panel, card, star) opens it at the picture shown as its cover: the link carries `#cover=<image key>`, and the album page scrolls to that picture and rings it once.
- **A grid page per album.** Every album shows its images as a grid of thumbnails, with a control to change the thumbnail
  size.
- **A full-screen image viewer.** Open any thumbnail to look at the picture in detail: zoom with the wheel, pinch or
  keyboard, pan by dragging, swipe sideways to move to the next image, swipe down to close, and use the arrow keys to
  step through the album.
- **A details panel.** Open it from the viewer to see the image key, its size in pixels and bytes, the prompts with copy
  buttons, the seed and the generation time.
- **Shareable links.** The address of the viewer points at a single image, so you can send someone the exact picture you
  are looking at.
- **Ten interface languages.** English, Simplified Chinese, Traditional Chinese, Japanese, Korean, German, French,
  Spanish, Brazilian Portuguese and Russian, chosen from a menu in the header.
- **System, light or dark theme.** Choose from the header; the system choice follows your device setting.

## Albums and where the images come from

An album is one set of images that `img-gen` renders from a recipe set and publishes. The gallery lists the albums that
are published. An album that `img-gen` has not published yet is left out of the site until its first publish. An album
marked `listBeforePublish` in `src/config/albums.ts` is listed earlier, with "Images coming soon", until `img-gen` publishes it. The pages work without JavaScript, because every
thumbnail is a link to its image file, and animation steps aside when your system asks for reduced motion.

## Run it locally

You need Node.js 24 or newer and pnpm (via corepack). The build reads the published albums, so it needs network access.

```bash
pnpm install
pnpm run dev
```

To build the static site and look at it locally:

```bash
pnpm run build
pnpm run preview
```

## PostHog events

The viewer sends two site-level events to PostHog when a visitor has not opted out and PostHog is loaded. They are
defined in `src/lib/posthog-events.ts`, and the viewer sends them from `src/scripts/viewer.ts`.

| Event | When it fires | Properties |
|-------|---------------|------------|
| `gallery_image_opened` | The viewer opens from a thumbnail or from a shared `#image` link. Moving to another image inside an open viewer does not send it. | `album`: the album's public slug |
| `gallery_image_zoomed` | A zoom-in step starts a zoom gesture: a wheel or pinch step, a double tap, the zoom button, or `+`. | none |

`album` is the only property. No image URL, file name, caption or prompt is ever sent.

**Deduplication rule.** One zoom gesture sends at most one `gallery_image_zoomed`. A gesture stays open while zoom steps keep arriving less than 600 ms apart, and a zoom-in after 600 ms of no zoom steps starts a new gesture. Gallery thumbnails carry no `data-ga-*` markers, so these events never overlap with `cta_click`. If a `data-ga-*` marker is added to a control that also sends one of these events, the business event is the canonical record for that action, and dashboards must not add it to `cta_click` counts.

Without PostHog, or after the visitor opts out, the viewer opens and zooms exactly as before and sends nothing.

## Package management

- The repository uses pnpm, pinned in `package.json` `packageManager`. Run `corepack enable` once, then `pnpm install`. `pnpm-lock.yaml` is the only lockfile; do not commit `package-lock.json`.
- Settings live in `pnpm-workspace.yaml`. `allowBuilds` lists the dependencies whose install scripts may run (reviewed individually, `false` means reviewed and denied); review any new dependency that has an install script and add it there.
- A local registry mirror belongs in `~/.npmrc` only. Never commit a `registry=` line or a mirror URL; `pnpm run check:registry` (also run in CI) fails on any non-`registry.npmjs.org` `tarball` in the lockfile and on mirror hosts in tracked files.
- Undeclared imports fail under pnpm's strict layout: declare the package instead of hoisting it.
