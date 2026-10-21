// The message catalogs. The YAML source is src/i18n/locales/<locale>/ui.yml, maintained with hagi18n, and
// scripts/generate-i18n-resources.mjs turns it into the JSON imported here (run by every npm script that needs it).
import type { Locale } from '../../config/site.ts';
import type { Messages } from './types.ts';
import enUS from '../generated/en-US/ui.json' with { type: 'json' };
import zhCN from '../generated/zh-CN/ui.json' with { type: 'json' };
import zhHant from '../generated/zh-Hant/ui.json' with { type: 'json' };
import jaJP from '../generated/ja-JP/ui.json' with { type: 'json' };
import koKR from '../generated/ko-KR/ui.json' with { type: 'json' };
import deDE from '../generated/de-DE/ui.json' with { type: 'json' };
import frFR from '../generated/fr-FR/ui.json' with { type: 'json' };
import esES from '../generated/es-ES/ui.json' with { type: 'json' };
import ptBR from '../generated/pt-BR/ui.json' with { type: 'json' };
import ruRU from '../generated/ru-RU/ui.json' with { type: 'json' };

export type { Messages, ViewerScriptMessages } from './types.ts';

// One catalog per supported locale. The Record type makes a missing locale a type error; `hagi18n audit` checks the
// fields of every language against English.
export const MESSAGES: Record<Locale, Messages> = {
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

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale];
}
