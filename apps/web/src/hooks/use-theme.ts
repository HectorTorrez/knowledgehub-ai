import { useCallback, useEffect, useState } from 'react';
import {
  applyTheme,
  getInitialTheme,
  THEME_CHANGE_EVENT,
  type Theme,
} from '~/lib/theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    function sync(event: Event) {
      setTheme((event as CustomEvent<Theme>).detail);
    }

    window.addEventListener(THEME_CHANGE_EVENT, sync);

    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  const setAndApply = useCallback((next: Theme) => {
    setTheme(next);
    applyTheme(next);
  }, []);

  const toggle = useCallback(() => {
    setAndApply(theme === 'dark' ? 'light' : 'dark');
  }, [setAndApply, theme]);

  return { theme, setTheme: setAndApply, toggle };
}
