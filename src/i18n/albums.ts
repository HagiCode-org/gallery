// Album names and descriptions per language, from src/i18n/locales/<locale>/albums.yml (keyed by album slug) through the
// generated JSON. Maintained with hagi18n like the interface text.
import type { Album } from '../config/albums.ts';
import { DEFAULT_LOCALE, type Locale } from '../config/site.ts';
import enUS from './generated/en-US/albums.json' with { type: 'json' };
import zhCN from './generated/zh-CN/albums.json' with { type: 'json' };
import zhHant from './generated/zh-Hant/albums.json' with { type: 'json' };
import jaJP from './generated/ja-JP/albums.json' with { type: 'json' };
import koKR from './generated/ko-KR/albums.json' with { type: 'json' };
import deDE from './generated/de-DE/albums.json' with { type: 'json' };
import frFR from './generated/fr-FR/albums.json' with { type: 'json' };
import esES from './generated/es-ES/albums.json' with { type: 'json' };
import ptBR from './generated/pt-BR/albums.json' with { type: 'json' };
import ruRU from './generated/ru-RU/albums.json' with { type: 'json' };

export interface AlbumText {
  readonly title: string;
  readonly description: string;
}

export const ALBUM_TEXT: Record<Locale, Record<string, AlbumText>> = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'zh-Hant': zhHant,
  'ja-JP': jaJP,
  'ko-KR': koKR,
  'de-DE': deDE,
  'fr-FR': frFR,
  'es-ES': esES,
  'pt-BR': ptBR,
  'ru-RU': ruRU,
};

// The album's name and description in `locale`. An album with no entry in that language (a new one not yet translated)
// shows its English text, and one with no English entry shows its slug, so a page is never blank.
export function albumText(album: Album, locale: Locale): AlbumText {
  return ALBUM_TEXT[locale]?.[album.slug] ?? ALBUM_TEXT[DEFAULT_LOCALE][album.slug] ?? { title: album.slug, description: '' };
}
