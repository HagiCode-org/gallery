---
name: HagiCode Gallery
description: A quiet, blue-accented page around a wall of pictures, with two dark rooms inside it: the sky hero and the viewer.
colors:
  primary: "#1d4ed8"
  primary-foreground: "#ffffff"
  primary-dark: "#8fb0ff"
  primary-foreground-dark: "#101a2a"
  background: "#f7f9fc"
  foreground: "#202938"
  card: "#ffffff"
  secondary: "#eff4ff"
  secondary-foreground: "#1f3b75"
  muted: "#edf2fb"
  muted-foreground: "#526174"
  accent: "#e8effd"
  accent-foreground: "#1e3a8a"
  border: "#dce4f1"
  input: "#d6e0ee"
  ring: "#3164d3"
  background-dark: "#0d1422"
  foreground-dark: "#e5ebf5"
  card-dark: "#141e30"
  secondary-dark: "#1d2a40"
  muted-dark: "#1b283d"
  muted-foreground-dark: "#aab8ce"
  border-dark: "#293851"
  input-dark: "#33445f"
  sky-deep: "#080d19"
  sky-mid: "#0f1a31"
  sky-fg: "#eaf0fa"
  sky-muted: "#b4c2d9"
  sky-line: "#243453"
  sky-star: "#8fb0ff"
  sky-ink: "#0b1424"
  viewer-bg: "#05070c"
  viewer-panel: "#0a0f19"
  viewer-fg: "#eef2f9"
  viewer-muted: "#a5b3c9"
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "clamp(2.75rem, 7.4vw, 5.75rem)"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "clamp(2.5rem, 7vw, 5rem)"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.25
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  pill: "999px"
spacing:
  gutter: "clamp(1rem, 3vw, 2.5rem)"
  grid-gap: "clamp(0.5rem, 1vw, 0.875rem)"
  wall-gap: "clamp(0.75rem, 1.6vw, 1.5rem)"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-sky-cta:
    backgroundColor: "{colors.sky-star}"
    textColor: "{colors.sky-ink}"
    rounded: "{rounded.lg}"
    height: "44px"
    padding: "0 18px 0 20px"
  density-button-active:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.sm}"
    size: "36px"
  album-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
  thumbnail:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.md}"
  viewer-button:
    backgroundColor: "transparent"
    textColor: "{colors.viewer-fg}"
    rounded: "{rounded.pill}"
    size: "44px"
---

# Design System: HagiCode Gallery

## Overview

**Creative North Star: "The Night Room"**

A picture is judged in a dark room, so the gallery builds one. The page around it is a pale or deep blue-grey sheet that stays quiet on purpose: one blue, a system font, ringed surfaces, no shadow on any piece of chrome. Pictures supply the colour. Inside that page sit two dark rooms that do not change with the visitor's theme: the sky hero on the home page and the viewer that opens over an album. They carry their own palette because the thing in front of the visitor is a picture, and a picture reads best against near-black.

Density is open. The wall of albums and the grid of thumbnails fill the width up to 120rem, with the gutter doing the framing. Motion is authored once per surface (the wall rising on home, the thumbnail travelling into the viewer) and everything else is a short transition. Nothing is added that the data does not carry: a key, a size, a prompt, a seed.

**Key Characteristics:**
- One blue for links, actions and focus; the pictures carry all other colour.
- Chrome separates with rings and borders; a shadow means a picture has been lifted.
- Two fixed dark rooms (sky, viewer) inside a theme-following page.
- Native system font and a native monospace for keys, counts and readouts; no web font.
- Motion is one authored moment per surface; hover effects belong to a fine pointer; reduced motion removes all of it.

## Colors

A blue-tinted neutral page with one cobalt accent in light and a soft periwinkle in dark. Tokens are the shadcn names (`radix-nova`, neutral base overridden with blue-tinted values); the theme follows `prefers-color-scheme` and there is no toggle.

### Primary
- **Cobalt Link** (#1d4ed8): the single action colour on the light page: links, default buttons, the album scroll-progress line.
- **Periwinkle Glow** (#8fb0ff): the same role on the dark page, and the star colour in the sky hero, where it also fills the call-to-action. Focus rings use it in dark (`ring` in dark is the same value).

### Secondary
- **Pale Wash** (#eff4ff) with **Deep Slate Blue** (#1f3b75) text: the pressed state of a density button. In dark, #1d2a40 with the page foreground.

### Neutral
- **Cool Paper** (#f7f9fc): the light page. **Night Blue** (#0d1422) is its dark counterpart.
- **Ink Slate** (#202938): light foreground. **Frost** (#e5ebf5) in dark.
- **Mist** (#edf2fb) and **Slate Mist** (#526174): muted surface and muted text in light. In dark, #1b283d and #aab8ce.
- **Hairline** (#dce4f1) and **Input Edge** (#d6e0ee): borders and field edges in light. In dark, #293851 and #33445f.
- **Card White** (#ffffff) / **Card Navy** (#141e30): card surfaces.
- **Ring Blue** (#3164d3): the focus ring on the light page.

### The Dark Rooms
- **Sky** (deep #080d19, mid #0f1a31, line #243453, text #eaf0fa, muted #b4c2d9, ink #0b1424): the home hero. A vertical wash from mid to deep with one radial glow (#16264b) behind the stars.
- **Viewer** (#05070c, panel #0a0f19, text #eef2f9, muted #a5b3c9, line white at 14%): the image viewer. Near-black, so the picture is the brightest thing in the room.

### Named Rules
**The One Blue Rule.** Links, actions and focus use the single blue (Cobalt Link in light, Periwinkle Glow in dark). A second accent hue is not introduced; colour variety comes from the images.

**The Fixed Dark Rule.** The sky and the viewer stay dark in a light theme. They own a palette; page tokens do not leak into them and theirs do not leak out.

**The Picture Tint Rule.** Where a surface needs colour, borrow it from the album's own cover (the blurred wash behind a card, the glow under an album page, the ambient light behind the viewer picture) instead of picking a decorative hue.

## Typography

**Display Font:** the system UI stack: `system-ui`, `-apple-system`, `Segoe UI`, Roboto, Helvetica Neue, Arial, PingFang SC, Microsoft YaHei, sans-serif
**Body Font:** the same stack
**Label/Mono Font:** `ui-monospace`, SF Mono, Cascadia Code, Menlo, Consolas, monospace

**Character:** Native and unfussy: a heavy, tightly tracked system sans for titles and a monospace for anything that is data (image keys, counts, ranges, seeds). No web font is loaded; the foundation test enforces it.

### Hierarchy
- **Display** (800, `clamp(2.75rem, 7.4vw, 5.75rem)`, 1.04, -0.035em): the sky hero's single `h1`.
- **Headline** (800, `clamp(2.5rem, 7vw, 5rem)`, 1.04, -0.03em): the album page's `h1`. The base `h1` is `clamp(2.25rem, 8vw, 3.5rem)` at the same weight.
- **Title** (700, 1.125rem, 1.2, -0.01em): album card titles. The featured first card grows to `clamp(1.375rem, 2.4vw, 1.875rem)`.
- **Body** (400, 0.9375rem to 1rem, 1.6): descriptions and ledes, in muted foreground, capped near 34ch to 44ch.
- **Label** (monospace, 0.6875rem to 0.8125rem, tabular numerals): thumbnail keys, the `001 – 016 / 720` range readout, viewer title and count.

### Named Rules
**The Data Is Mono Rule.** Anything that is a value from the pipeline (a key, a seed, a size, a range) is set in the monospace stack with tabular numerals. Descriptive text is never mono.

**The One H1 Rule.** Each page has exactly one `h1`; the site name in the top bar is a link, not a heading.

## Layout

A single column that fills up to 120rem, framed by a fluid gutter of `clamp(1rem, 3vw, 2.5rem)`. Home is the sky hero followed by the album wall: an auto-fill grid with 18rem minimum cells and a `clamp(0.75rem, 1.6vw, 1.5rem)` gap, where the first album spans two columns and two rows from 48rem up. An album page is a sticky bar, a hero (text left, cover right, stacked on small screens) and a thumbnail grid.

The thumbnail grid is auto-fill on a `--cell` size: 9.5rem by default, with an S / M / L control from 40rem up (6.5rem, 9.5rem, 16rem). Cells keep each image's own aspect ratio. Below 48rem the viewer's details become a grid row under the picture (54dvh at most): the stage shrinks to what is left, so the picture and the previous / next buttons stay in view while the prompts are read, and the panel leads with the prompts, each in a faint well, with the short facts two to a row after them. On a phone the S / M / L control is shown (three, two and one columns), the site bar is one row (the language shows its globe alone), the album hero puts the title across the full width, and after the lead album each home card becomes a row (stack left, text right). Every flex and grid child carries `min-w-0` so long labels wrap at 360px. Touch targets are 44px (2.75rem) for links and viewer buttons, 36px for the density buttons.

### Named Rules
**The Real Shape Rule.** A cell, a stack or a cover takes the aspect ratio the index reports for its image. Pictures are never cropped to a house ratio.

## Elevation & Depth

Flat chrome, lifted pictures. Page surfaces (cards, the sticky bar, the density control) separate with a 1px border or a `ring-1` at 10% foreground and carry no shadow; the seed UI components apply none. A shadow appears only where a picture is raised off a surface, and it always has an offset and a blur. The sticky album bar gains its blurred, 80% page-colour surface only as the page scrolls under it.

### Shadow Vocabulary
- **Album sheet** (`box-shadow: 0 0.75rem 1.75rem -0.5rem rgb(5 8 14 / 0.5)`): each picture in a card's fanned stack.
- **Lifted thumbnail** (`box-shadow: 0 1.25rem 2.25rem -0.875rem rgb(5 8 14 / 0.6)`): a hovered or focused thumbnail, with a 1.04 scale.
- **Album cover** (`box-shadow: 0 1.75rem 3.5rem -1.75rem rgb(5 8 14 / 0.6)`): the cover on an album page.
- **Viewer picture** (`box-shadow: 0 2rem 5rem -2rem rgb(0 0 0 / 0.85)`): the picture on show.

### Named Rules
**The Lifted Picture Rule.** A shadow means a picture is in the air. A card, a button, a bar or a panel never gets one.

## Shapes

Gently rounded and consistent. The base radius is 0.625rem (10px) with a derived scale: 6px small, 8px medium (thumbnails, the density control), 10px large (buttons), 14px extra large (cards, the sky's frame, the album cover). Circles are reserved for viewer controls (999px). The sky's cover images use 14px and its satellites 8px. Borders are 1px hairlines in the border token, or white at 14 to 22% inside the dark rooms.

## Components

Quiet and precise: small, ringed, native-feeling controls that leave the pictures the attention.

### Buttons
- **Shape:** 10px radius, 32px tall by default, 14px weight-500 label, 16px Lucide icons.
- **Primary:** Cobalt Link fill with white text, 80% opacity on hover; 1px press nudge. Focus is a 3px ring at 50% ring colour.
- **Secondary / Ghost / Outline:** token-based tonal fills from the shadcn seed; ghost hovers to the muted fill.
- **Sky call-to-action:** Periwinkle Glow fill with sky-ink text, 44px tall, 10px radius, a lighter #aac2ff on hover, and a 3px downward nudge of its arrow.

### Chips
- **Badge** (shadcn seed) for small labels; no other chip pattern is in use.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** card token over the page, with the album's own cover blurred and saturated behind the art at 50% opacity, 85% on hover.
- **Shadow Strategy:** none on the card; see Elevation & Depth for the pictures inside it.
- **Border:** `ring-1` at 10% foreground.
- **Internal Padding:** 16px, 12px in the small size.

### Navigation
- **Site bar:** brand link, 15px weight 700, 44px target, no heading semantics, 14px vertical and gutter horizontal padding.
- **Album bar:** sticky, with a back link, a title that fades in after 7rem of scroll, a mono range readout and the S / M / L control. A 2px primary progress line fills the bottom edge as the page scrolls.

### Density control
- A 1px bordered group of 36px buttons, hidden below 40rem. The pressed button takes the secondary fill.

### Thumbnail (signature)
Fills its cell at the image's own ratio, 8px radius, muted background. The mono key sits on a bottom scrim over the picture and appears on hover or keyboard focus with a fine pointer. Thumbnails fade in only after the real image has loaded.

### Image viewer (signature)
A full-screen native `<dialog>` in the Viewer palette. A blurred, dimmed copy of the picture is the ambient light. Round 44px controls sit in a top bar, previous and next at the sides. A 26rem (38vw max) details panel holds the key, sizes, prompts with copy buttons, the seed and the generation time.

### Album card stack (signature)
A fan of three pictures that settle with a spring and open wider on hover (a fine pointer only), over the cover's blurred wash and a soft pointer spotlight.

### Sky hero (signature)
A dark framed room (14px radius, sky-line border) holding the `h1`, a lede, the call-to-action, and one star per album: the album's cover (14px radius, 1px white-at-22% edge) with a name label beneath and smaller satellite pictures around it. A canvas draws lines between neighbouring albums.

## Do's and Don'ts

### Do:
- **Do** let the pictures carry colour; keep the chrome to the one blue, the neutrals and the dark rooms.
- **Do** keep the sky and the viewer dark in every theme.
- **Do** use a shadow only on a lifted picture, always with an offset and a blur.
- **Do** write scroll-driven animation as longhands (`animation-name`, `animation-timeline`), because the minifier folds a complete shorthand into one declaration that some browsers drop.
- **Do** put hover effects behind `(hover: hover) and (pointer: fine)` and make every animation resolve to the plain visible state, so a page without script or with reduced motion shows everything.
- **Do** use the monospace stack with tabular numerals for data values; keep 44px targets on links and viewer controls.

### Don't:
- **Don't** put cards around thumbnails; keys sit on a scrim over the picture.
- **Don't** add a second accent hue, a web font or a theme toggle.
- **Don't** give a card, button, bar or panel a box shadow.
- **Don't** crop pictures to a fixed ratio; use the ratio the index reports.
- **Don't** hide content behind an animation's start state: keyframes have no `to`, so the resting state is the real card.
