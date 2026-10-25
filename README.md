# HagiCode Gallery

Pictures you can look at closely and see how they were made. HagiCode Gallery is the public site at
**[gallery.hagicode.com](https://gallery.hagicode.com)** where you can browse the image albums that HagiCode's `img-gen`
pipeline publishes.

## What you get

- **A home page of albums.** Each published album is listed with its name and description.
  Published agent and model albums take turns in the first spot on each visit or refresh. Covers, stacks and sky
  pictures are sampled from each album on every visit; the same cover appears in the sky and on its card.
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
are published. The newest series, such as the seven AIGC character galleries, are listed before their first images
exist and show "Images coming soon" until `img-gen` publishes them. The pages work without JavaScript, because every
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
