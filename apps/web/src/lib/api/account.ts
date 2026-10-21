import type {
  AuthSessionListResponse,
  ChangePasswordRequest,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from '@knowledgehub/shared-types';
import { apiFetch } from './client';

export const accountApi = {
  updateProfile(input: UpdateProfileRequest): Promise<UpdateProfileResponse> {
    return apiFetch<UpdateProfileResponse>('/auth/profile', {
      method: 'PATCH',
      body: input,
      authRecovery: true,
    });
  },

  changePassword(input: ChangePasswordRequest): Promise<void> {
    return apiFetch<void>('/auth/change-password', {
      method: 'POST',
      body: input,
      authRecovery: true,
    });
  },

  sessions(): Promise<AuthSessionListResponse> {
    return apiFetch<AuthSessionListResponse>('/auth/sessions', {
      authRecovery: true,
    });
  },

  revokeSession(sessionId: string): Promise<void> {
    return apiFetch<void>(`/auth/sessions/${sessionId}`, {
      method: 'DELETE',
      authRecovery: true,
    });
  },
};
