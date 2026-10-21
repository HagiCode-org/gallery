// The theme choice. "system" stores nothing and leaves data-theme off, so the prefers-color-scheme rules in
// src/styles/global.css decide; "light" and "dark" set data-theme. The storage key is the one the other HagiCode sites
// (Starlight docs, the marketing site, Hagilight's root transit) already use for the same choice.
export const THEME_STORAGE_KEY = 'starlight-theme';

export const THEME_CHOICES = ['system', 'light', 'dark'] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

// Anything that is not an explicit light or dark choice is "system": an empty string (what Starlight stores for auto), a
// missing value, or a value some other site wrote.
export function parseThemeChoice(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}
