export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'knowledgehub:theme';
const DARK_CLASS = 'dark';

export function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(DARK_CLASS, theme === 'dark');
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}
