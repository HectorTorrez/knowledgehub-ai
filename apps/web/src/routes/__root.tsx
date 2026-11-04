/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from '@tanstack/react-router';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { useCallback, type ReactNode } from 'react';
import { ToastProvider } from '~/components/ui/toast';
import { useTheme } from '~/hooks/use-theme';
import { type Locale } from '~/lib/i18n/locale';
import { getRequestLocale, writeLocaleCookie } from '~/lib/i18n/request-locale';
import { I18nProvider, useLocale } from '~/lib/i18n/provider';
import { createTranslator } from '~/lib/i18n/translate';
import { SITE_NAME, pageHead } from '~/lib/seo';
import appCss from '~/styles/app.css?url';

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  beforeLoad: () => ({ locale: getRequestLocale() }),
  head: ({ matches, match }) => {
    const pathname = matches[matches.length - 1]?.pathname;
    const t = createTranslator(match.context.locale);
    const page = pageHead({
      title: t('seo.defaultTitle'),
      description: t('seo.description'),
      path: pathname,
      imageAlt: t('seo.ogImageAlt'),
    });

    return {
      meta: [
        { charSet: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        { name: 'theme-color', content: '#171717' },
        { name: 'application-name', content: SITE_NAME },
        { name: 'apple-mobile-web-app-title', content: SITE_NAME },
        { name: 'robots', content: 'index, follow' },
        ...page.meta,
      ],
      links: [
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        {
          rel: 'apple-touch-icon',
          sizes: '180x180',
          href: '/apple-touch-icon.png',
        },
        { rel: 'manifest', href: '/site.webmanifest' },
        ...page.links,
        { rel: 'stylesheet', href: appCss },
      ],
    };
  },
  component: RootComponent,
});

function RootComponent() {
  const { locale } = Route.useRouteContext();
  const router = useRouter();
  const handleLocaleChange = useCallback(
    (next: Locale) => {
      writeLocaleCookie(next);
      void router.invalidate();
    },
    [router],
  );

  return (
    <I18nProvider initialLocale={locale} onLocaleChange={handleLocaleChange}>
      <RootDocument>
        <ThemeInitializer />
        <ToastProvider>
          <Outlet />
        </ToastProvider>
      </RootDocument>
    </I18nProvider>
  );
}

function ThemeInitializer() {
  useTheme();

  return null;
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  const locale = useLocale();

  return (
    <html lang={locale}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {import.meta.env.DEV &&
        import.meta.env.VITE_DISABLE_DEVTOOLS !== 'true' ? (
          <>
            <TanStackRouterDevtools position="bottom-right" />
            <ReactQueryDevtools buttonPosition="bottom-left" />
          </>
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}
