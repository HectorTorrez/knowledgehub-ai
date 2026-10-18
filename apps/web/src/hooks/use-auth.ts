import type { LoginRequest, RegisterRequest } from '@knowledgehub/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { login, logout, register, sessionQuery } from '~/lib/auth/session';

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

export function useLogout() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => logout(client),
  });
}
