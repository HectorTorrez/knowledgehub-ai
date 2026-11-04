import type { LoginRequest, RegisterRequest } from '@knowledgehub/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '~/components/ui/toast';
import { useReportError } from '~/hooks/use-error-toast';
import { accountApi } from '~/lib/api/account';
import { login, logout, register, sessionQuery } from '~/lib/auth/session';
import { useLocale, useT } from '~/lib/i18n/hooks';

export function useSession() {
  return useQuery(sessionQuery);
}

export function useLogin() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: LoginRequest) => login(client, input),
  });
}

export function useRegister() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: RegisterRequest) => register(client, input),
  });
}

export function useResendVerificationEmail(email: string) {
  const locale = useLocale();
  const t = useT();
  const { toast } = useToast();
  const reportError = useReportError();

  return useMutation({
    mutationFn: () => accountApi.resendVerification(locale),
    onSuccess: () =>
      toast({
        variant: 'success',
        title: t('emailBanner.sent'),
        description: t('emailBanner.sentDescription', { email }),
      }),
    onError: (error) => reportError(error),
  });
}

export function useLogout() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => logout(client),
  });
}
