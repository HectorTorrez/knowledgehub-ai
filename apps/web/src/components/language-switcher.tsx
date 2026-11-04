import { Check, Languages } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { LOCALES, LOCALE_NAMES } from '~/lib/i18n/locale';
import { useLocale, useSetLocale, useT } from '~/lib/i18n/provider';

export function LanguageMenuItems() {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();

  return (
    <>
      <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
      {LOCALES.map((option) => (
        <DropdownMenuItem
          key={option}
          aria-current={option === locale ? 'true' : undefined}
          onSelect={() => setLocale(option)}
        >
          {option === locale ? <Check /> : <span className="size-4" />}
          {LOCALE_NAMES[option]}
        </DropdownMenuItem>
      ))}
    </>
  );
}

export function LanguageSwitcher() {
  const t = useT();
  const locale = useLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('common.language')}>
          <Languages />
          {LOCALE_NAMES[locale]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <LanguageMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
