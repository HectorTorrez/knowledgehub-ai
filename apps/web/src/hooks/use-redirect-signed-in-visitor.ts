import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { sessionQuery } from '~/lib/auth/session';

export function useRedirectSignedInVisitor(target: string | null) {
  const session = useQuery(sessionQuery);
  const router = useRouter();
  const hasResolvedArrivalSession = useRef(false);

  useEffect(() => {
    if (!session.data || hasResolvedArrivalSession.current) return;
    hasResolvedArrivalSession.current = true;
    if (session.data.status === 'authenticated' && target)
      router.history.replace(target);
  }, [session.data, target, router]);
}
