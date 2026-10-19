import { useCallback, useState } from 'react';
import { applyTheme, getInitialTheme, type Theme } from '~/lib/theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const setAndApply = useCallback((next: Theme) => {
    setTheme(next);
    applyTheme(next);
  }, []);

  const toggle = useCallback(() => {
    setAndApply(theme === 'dark' ? 'light' : 'dark');
  }, [setAndApply, theme]);

  return { theme, setTheme: setAndApply, toggle };
}
