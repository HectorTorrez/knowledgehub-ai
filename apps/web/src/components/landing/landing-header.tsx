import { Link } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Brand } from '~/components/brand';
import { LanguageSwitcher } from '~/components/language-switcher';
import { primaryAction } from '~/components/landing/frame';
import { ThemeToggle } from '~/components/theme-toggle';
import { Button } from '~/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '~/components/ui/drawer';
import { useT } from '~/lib/i18n/hooks';
import { cn } from '~/lib/utils';

const sectionLinks = [
  { href: '/#features', key: 'features' },
  { href: '/#how-it-works', key: 'howItWorks' },
  { href: '/#security', key: 'security' },
  { href: '/#pricing', key: 'pricing' },
  { href: '/#faq', key: 'faq' },
] as const;

export function LandingHeader() {
  const t = useT();
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-md">
      <nav
        aria-label={t('common.mainNavigation')}
        className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 border-x px-5 sm:px-8 lg:px-10"
      >
        <Link to="/" className="focus-visible:ring-2 focus-visible:ring-ring">
          <Brand compact className="whitespace-nowrap" />
        </Link>
        <div className="hidden items-center gap-6 text-sm lg:flex">
          {sectionLinks.map(({ href, key }) => (
            <a
              key={key}
              href={href}
              className="py-2 text-muted-foreground underline-offset-[6px] transition-colors hover:text-foreground hover:underline"
            >
              {t(`landing.nav.${key}`)}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link to="/login">{t('landing.nav.logIn')}</Link>
          </Button>
          <Button
            asChild
            className={cn('hidden sm:inline-flex', primaryAction)}
          >
            <Link to="/register">{t('landing.nav.getStarted')}</Link>
          </Button>
          <MobileMenu />
        </div>
      </nav>
    </header>
  );
}

const DESKTOP_NAV_QUERY = '(min-width: 64rem)';

function useCloseOnDesktopNav(setOpen: (open: boolean) => void) {
  useEffect(() => {
    const desktopNav = window.matchMedia(DESKTOP_NAV_QUERY);
    const closeWhenDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    desktopNav.addEventListener('change', closeWhenDesktop);
    return () => desktopNav.removeEventListener('change', closeWhenDesktop);
  }, [setOpen]);
}

function MobileMenu() {
  const t = useT();
  const [open, setOpen] = useState(false);
  useCloseOnDesktopNav(setOpen);
  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label={t('landing.nav.openMenu')}
        >
          <Menu />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="marketing gap-0">
        <DrawerHeader>
          <DrawerTitle>
            <Brand />
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            {t('landing.nav.menu')}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col border-t px-4">
          {sectionLinks.map(({ href, key }) => (
            <DrawerClose asChild key={key}>
              <a
                href={href}
                className="border-b px-3 py-3.5 text-lg font-medium tracking-tight hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t(`landing.nav.${key}`)}
              </a>
            </DrawerClose>
          ))}
        </div>
        <DrawerFooter className="border-t">
          <Button asChild variant="outline">
            <Link to="/login">{t('landing.nav.logIn')}</Link>
          </Button>
          <Button asChild className={primaryAction}>
            <Link to="/register">{t('landing.nav.getStarted')}</Link>
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
