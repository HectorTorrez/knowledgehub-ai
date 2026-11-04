export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'knowledgehub:theme';
export const THEME_CHANGE_EVENT = 'knowledgehub:themechange';
const DARK_CLASS = 'dark';
const THEME_COLORS: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#171717',
};

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
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[theme]);
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(
    new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme }),
  );
}

export const themeBootstrapScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
