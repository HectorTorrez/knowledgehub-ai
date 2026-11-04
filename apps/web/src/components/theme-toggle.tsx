import { Moon, Sun } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { useTheme } from '~/hooks/use-theme';
import { useT } from '~/lib/i18n/provider';

export function ThemeToggle() {
  const t = useT();
  const { theme, toggle } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={
        theme === 'dark'
          ? t('nav.switchToLightTheme')
          : t('nav.switchToDarkTheme')
      }
      onClick={toggle}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}
