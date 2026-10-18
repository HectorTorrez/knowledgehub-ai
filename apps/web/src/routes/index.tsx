import { createFileRoute, redirect } from '@tanstack/react-router';
import { sessionQuery } from '~/lib/auth/session';

export const Route = createFileRoute('/')({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const state = await context.queryClient
      .fetchQuery(sessionQuery)
      .catch(() => null);

    throw redirect({
      to: state?.status === 'authenticated' ? '/organizations' : '/login',
    });
  },
});
