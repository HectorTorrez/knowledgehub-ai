import type {
  AuthSessionListResponse,
  ChangePasswordRequest,
  EmailLocale,
  RequestPasswordResetRequest,
  ResendVerificationRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
  UpdateProfileResponse,
  VerifyEmailRequest,
} from '@knowledgehub/shared-types';
import { apiFetch } from './client';

export const accountApi = {
  verifyEmail(token: string): Promise<void> {
    const body: VerifyEmailRequest = { token };
    return apiFetch<void>('/auth/verify-email', { method: 'POST', body });
  },

  resendVerification(locale: EmailLocale): Promise<void> {
    const body: ResendVerificationRequest = { locale };
    return apiFetch<void>('/auth/verify-email/resend', {
      method: 'POST',
      body,
      authRecovery: true,
    });
  },

  requestPasswordReset(input: RequestPasswordResetRequest): Promise<void> {
    return apiFetch<void>('/auth/password-reset/request', {
      method: 'POST',
      body: input,
    });
  },

  resetPassword(input: ResetPasswordRequest): Promise<void> {
    return apiFetch<void>('/auth/password-reset/confirm', {
      method: 'POST',
      body: input,
    });
  },

  exportData(): Promise<unknown> {
    return apiFetch('/auth/me/export', { authRecovery: true });
  },

  deleteAccount(password: string): Promise<void> {
    return apiFetch('/auth/me', {
      method: 'DELETE',
      body: { password, confirmation: 'DELETE' },
    });
  },

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
