// The header's two controls: the theme choice and the language menu. A plain module, not an island. The theme is
// applied before first paint by the inline script in BaseLayout; this script only wires the buttons and keeps them in
// step with the stored choice, including a change made in another tab.
import { THEME_STORAGE_KEY, parseThemeChoice, type ThemeChoice } from '../lib/theme.ts';

function storedChoice(): ThemeChoice {
  try {
    return parseThemeChoice(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

function applyChoice(choice: ThemeChoice): void {
  if (choice === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', choice);
}

function setupTheme(group: HTMLElement): void {
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')];
  const paint = (choice: ThemeChoice) => {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice));
  };
  paint(storedChoice());
  group.hidden = false;

  group.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-theme-choice]');
    if (!button) return;
    const choice = parseThemeChoice(button.dataset.themeChoice);
    applyChoice(choice);
    paint(choice);
    try {
      // Starlight stores an empty string for "follow the system"; removing the key says the same and is simpler.
      if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, choice);
    } catch {
      // Storage can be blocked. The choice still applies to this page.
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    const choice = storedChoice();
    applyChoice(choice);
    paint(choice);
  });
}

function setupLanguageMenu(menu: HTMLDetailsElement): void {
  const close = () => {
    menu.open = false;
  };
  document.addEventListener('click', (event) => {
    if (menu.open && !menu.contains(event.target as Node)) close();
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !menu.open) return;
    close();
    menu.querySelector<HTMLElement>('summary')?.focus();
  });
  menu.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Node | null;
    if (next && !menu.contains(next)) close();
  });
}

const toggle = document.querySelector<HTMLElement>('[data-theme-toggle]');
if (toggle) setupTheme(toggle);
const menu = document.querySelector<HTMLDetailsElement>('[data-lang-menu]');
if (menu) setupLanguageMenu(menu);
