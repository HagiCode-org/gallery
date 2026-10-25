// The home page's pictures: chosen at random once per build and cut down to the sizes the page draws, so the live page
// loads a fixed, small set of files instead of full-size album images. Build-time only: it imports astro:assets.
import { getImage } from 'astro:assets';
import { isPending, loadAlbums, thumbnailFor, type Thumbnail } from './albums';
import { fitWithin, samplePictures } from './home';

// Longest edge in pixels. A card or panel stack is drawn about 220-260px wide; a sky star is at most 108px and its
// satellites and the blurred wash behind a card are smaller still.
export const CARD_EDGE = 320;
export const SMALL_EDGE = 160;

// `key` is the image's key in its album, so a link can open the album at this picture.
export interface HomePicture {
  readonly key: string;
  readonly card: Thumbnail;
  readonly small: Thumbnail;
}

export interface HomeSelection {
  // Slug of the model album whose panel is open, or null when no model album has images.
  readonly lead: string | null;
  // Per published album, the pictures in the order the page uses them: the cover first.
  readonly pictures: ReadonlyMap<string, readonly HomePicture[]>;
}

// A sheet cell already is a tiny crop of one shared file, so only a whole image is re-cut. Astro writes the result
// under /_astro/ with a content hash, which is why the page does not need the image cache for it.
async function shrink(thumb: Thumbnail, edge: number, quality: number): Promise<Thumbnail> {
  if (thumb.kind === 'sheet') return thumb;
  const { width, height } = fitWithin(thumb.width, thumb.height, edge);
  const image = await getImage({ src: thumb.url, width, height, fit: 'cover', format: 'avif', quality });
  return { kind: 'image', url: image.src, bytes: 0, width, height };
}

async function select(count: number, random: () => number): Promise<HomeSelection> {
  const published = (await loadAlbums()).filter((loaded) => !isPending(loaded));
  const [lead] = samplePictures(published.filter((loaded) => loaded.album.featuredOnHome === true), 1, random);
  const pictures = await Promise.all(
    published.map(async (loaded) => {
      const chosen = samplePictures(loaded.index.entries, count, random);
      const cut = await Promise.all(
        chosen.map(async (entry): Promise<HomePicture> => {
          const full = thumbnailFor(loaded.index, entry);
          return { key: entry.key, card: await shrink(full, CARD_EDGE, 45), small: await shrink(full, SMALL_EDGE, 40) };
        }),
      );
      return [loaded.album.slug, cut] as const;
    }),
  );
  return { lead: lead?.album.slug ?? null, pictures: new Map(pictures) };
}

// Every page of every language shares one selection, so the whole build shows the same pictures. `count` is how many
// pictures each album needs; the first call of a build fixes it.
let selection: Promise<HomeSelection> | undefined;
export const homeSelection = (count: number, random = Math.random): Promise<HomeSelection> => (selection ??= select(count, random));
