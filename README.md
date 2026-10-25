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

You need Node.js 24 or newer and npm. The build reads the published albums, so it needs network access.

```bash
npm ci
npm run dev
```

To build the static site and look at it locally:

```bash
npm run build
npm run preview
```
