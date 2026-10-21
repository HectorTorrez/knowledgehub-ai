import type {
  AcceptInvitationRequest,
  AcceptInvitationResponse,
  CreateInvitationRequest,
  CreateInvitationResponse,
  InvitationListResponse,
} from '@knowledgehub/shared-types';
import { apiFetch } from './client';

function invitationsPath(organizationId: string): string {
  return `/organizations/${organizationId}/invitations`;
}

export const invitationsApi = {
  create(
    organizationId: string,
    input: CreateInvitationRequest,
  ): Promise<CreateInvitationResponse> {
    return apiFetch<CreateInvitationResponse>(
      invitationsPath(organizationId),
      { method: 'POST', body: input, authRecovery: true },
    );
  },

  list(organizationId: string): Promise<InvitationListResponse> {
    return apiFetch<InvitationListResponse>(invitationsPath(organizationId), {
      authRecovery: true,
    });
  },

  revoke(organizationId: string, invitationId: string): Promise<void> {
    return apiFetch<void>(
      `${invitationsPath(organizationId)}/${invitationId}`,
      { method: 'DELETE', authRecovery: true },
    );
  },

  accept(token: string): Promise<AcceptInvitationResponse> {
    const body: AcceptInvitationRequest = { token };

    return apiFetch<AcceptInvitationResponse>('/invitations/accept', {
      method: 'POST',
      body,
      authRecovery: true,
    });
  },
};
