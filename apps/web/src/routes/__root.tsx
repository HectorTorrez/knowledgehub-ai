/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ToastProvider } from '~/components/ui/toast';
import { DEFAULT_TITLE, SITE_NAME, pageHead } from '~/lib/seo';
import appCss from '~/styles/app.css?url';

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: ({ matches }) => {
    const pathname = matches[matches.length - 1]?.pathname;
    const page = pageHead({ title: DEFAULT_TITLE, path: pathname });

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
  return (
    <RootDocument>
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {import.meta.env.DEV ? (
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
