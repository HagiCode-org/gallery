# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Public visitors on the web who want to see HagiCode's visual work: the images HagiCode's img-gen pipeline produces. They arrive on the home page, pick an album, scan its images and open one to look closer. Some will want to understand how an image was made.

## Product Purpose
HagiCode Gallery is a static site that publishes img-gen's output for the public. The home page lists the published albums, each album page shows its images as a grid, and an image opens with its generation details. Success is a visitor who can browse an album, look at any image closely and see how it was made without leaving the page.

## Positioning
Every image shows how it was made. Prompts, seed, pixel and byte size and generation time sit beside each picture, because they come straight from the img-gen pipeline that produced it. A plain image host or a generic AI-art gallery cannot truthfully show that.

## Operating Context
- Albums are R2 prefixes published by `img-gen` (`repos/img-gen`) at `https://img-gen.hagicode.com`. Each publish writes an `index.json` for the batch and a `<stem>.metadata.json` per image.
- The build reads each album's `index.json` once; the browser reads an image's metadata when that image is opened.
- Albums are listed in `src/config/albums.ts`. An album is omitted until its index is published, unless it is flagged `listBeforePublish`, which lists it with no images and a "coming soon" note.
- Deployment is a static build published to `gh-pages` and served at `https://gallery.hagicode.com`.

## Capabilities and Constraints
- Content comes only from img-gen's published R2 data. The gallery does not invent captions, counts, credits or descriptions that the index and metadata do not carry. (Confirmed by the user.)
- Capabilities in the codebase today: album list, per-album grid, image viewer with zoom, pan, swipe and a details panel (key, size, prompts with copy buttons, seed, generation time), deep links through the URL fragment, a Cache API image cache.
- Existing technical constraints, stated in the README and not re-confirmed in this interview: static Astro output, no hydrated islands, pages usable with JavaScript disabled, a single `en-US` locale, theme follows `prefers-color-scheme` with no toggle, motion steps aside for `prefers-reduced-motion`, Hagilight pinned to one exact version, shadcn components added only through the CLI.
- Undecided: whether the public should also see a statement about how the images were generated, beyond the prompts the metadata already shows.

## Brand Commitments
Part of the HagiCode site family (Hagilight provides the shared head, footer, favicon and metadata). Site name: HagiCode Gallery.

## Evidence on Hand
Published img-gen albums: achievement icons, agent CLI default cats, anime theme backgrounds, cat head gallery, document subject theme previews, hero avatars, preset task backgrounds, prompt scenario covers, session favicons, startup splash. There are no testimonials, usage numbers or visitor data in the repository, and none should be invented.

## Product Principles
1. The pictures are the content. Everything else supports looking at them.
2. Show provenance. An image's prompts, seed and generation details are part of the product, not an extra.
3. Say only what the data says. Nothing is shown that img-gen's index and metadata do not provide.
4. Stay light and static. A visitor can reach every image without waiting on a script.
5. Serve the public visitor first, not the person who made the image.

## Accessibility & Inclusion
No product-specific standard was set in this interview. The README commits to keyboard control of the viewer, `prefers-reduced-motion` support and pages that work without JavaScript; treat those as existing behavior to keep.
