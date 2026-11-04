import { Link } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import { Brand } from '~/components/brand';
import { LanguageSwitcher } from '~/components/language-switcher';
import { ThemeToggle } from '~/components/theme-toggle';
import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { useT } from '~/lib/i18n/hooks';

const sectionLinks = [
  { href: '#features', key: 'features' },
  { href: '#how-it-works', key: 'howItWorks' },
  { href: '#security', key: 'security' },
  { href: '#pricing', key: 'pricing' },
  { href: '#faq', key: 'faq' },
] as const;

export function LandingHeader() {
  const t = useT();
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-lg">
      <nav
        aria-label={t('common.mainNavigation')}
        className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5"
      >
        <Link
          to="/"
          className="rounded-md focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Brand compact className="whitespace-nowrap" />
        </Link>
        <div className="hidden items-center gap-1 text-sm lg:flex">
          {sectionLinks.map(({ href, key }) => (
            <a
              key={key}
              href={href}
              className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
          <Button asChild className="hidden sm:inline-flex">
            <Link to="/register">{t('landing.nav.getStarted')}</Link>
          </Button>
          <MobileMenu />
        </div>
      </nav>
    </header>
  );
}

function MobileMenu() {
  const t = useT();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label={t('landing.nav.openMenu')}
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="gap-0">
        <SheetHeader>
          <SheetTitle>
            <Brand />
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t('landing.nav.menu')}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-4">
          {sectionLinks.map(({ href, key }) => (
            <SheetClose asChild key={key}>
              <a
                href={href}
                className="rounded-md px-3 py-2.5 text-base font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t(`landing.nav.${key}`)}
              </a>
            </SheetClose>
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-2 border-t p-4">
          <Button asChild variant="outline">
            <Link to="/login">{t('landing.nav.logIn')}</Link>
          </Button>
          <Button asChild>
            <Link to="/register">{t('landing.nav.getStarted')}</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
