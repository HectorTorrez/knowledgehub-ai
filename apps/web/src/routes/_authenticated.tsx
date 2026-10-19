import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from '~/components/app-shell';
import { sessionQuery } from '~/lib/auth/session';

export const Route = createFileRoute('/_authenticated')({
  ssr: false,
  head: () => ({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] }),
  beforeLoad: async ({ context, location }) => {
    const state = await context.queryClient.fetchQuery(sessionQuery);

    if (state.status !== 'authenticated') {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      });
    }

    return { user: state.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
