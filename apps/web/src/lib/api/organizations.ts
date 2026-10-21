import type {
  AddMemberRequest,
  AddMemberResponse,
  CreateOrganizationRequest,
  MemberListResponse,
  OrganizationDetailResponse,
  OrganizationListResponse,
  OrganizationUsageResponse,
  UpdateMemberRoleRequest,
  UpdateMemberRoleResponse,
  UpdateOrganizationRequest,
} from '@knowledgehub/shared-types';
import { apiFetch, type RequestOptions } from './client';

const ORGANIZATIONS_PATH = '/organizations';

export const organizationsApi = {
  list(options: RequestOptions = {}): Promise<OrganizationListResponse> {
    return apiFetch<OrganizationListResponse>(ORGANIZATIONS_PATH, {
      authRecovery: true,
      signal: options.signal,
    });
  },

  create(input: CreateOrganizationRequest): Promise<OrganizationDetailResponse> {
    return apiFetch<OrganizationDetailResponse>(ORGANIZATIONS_PATH, {
      method: 'POST',
      body: input,
      authRecovery: true,
    });
  },

  updateName(
    organizationId: string,
    input: UpdateOrganizationRequest,
  ): Promise<OrganizationDetailResponse> {
    return apiFetch<OrganizationDetailResponse>(
      `${ORGANIZATIONS_PATH}/${organizationId}`,
      { method: 'PATCH', body: input, authRecovery: true },
    );
  },

  remove(organizationId: string): Promise<void> {
    return apiFetch<void>(`${ORGANIZATIONS_PATH}/${organizationId}`, {
      method: 'DELETE',
      authRecovery: true,
    });
  },

  leave(organizationId: string): Promise<void> {
    return apiFetch<void>(
      `${ORGANIZATIONS_PATH}/${organizationId}/leave`,
      { method: 'POST', authRecovery: true },
    );
  },

  usage(organizationId: string): Promise<OrganizationUsageResponse> {
    return apiFetch<OrganizationUsageResponse>(
      `${ORGANIZATIONS_PATH}/${organizationId}/usage`,
      { authRecovery: true },
    );
  },

  detail(organizationId: string): Promise<OrganizationDetailResponse> {
    return apiFetch<OrganizationDetailResponse>(
      `${ORGANIZATIONS_PATH}/${organizationId}`,
      { authRecovery: true },
    );
  },

  members(organizationId: string): Promise<MemberListResponse> {
    return apiFetch<MemberListResponse>(
      `${ORGANIZATIONS_PATH}/${organizationId}/members`,
      { authRecovery: true },
    );
  },

  addMember(
    organizationId: string,
    input: AddMemberRequest,
  ): Promise<AddMemberResponse> {
    return apiFetch<AddMemberResponse>(
      `${ORGANIZATIONS_PATH}/${organizationId}/members`,
      { method: 'POST', body: input, authRecovery: true },
    );
  },

  updateMemberRole(
    organizationId: string,
    userId: string,
    input: UpdateMemberRoleRequest,
  ): Promise<UpdateMemberRoleResponse> {
    return apiFetch<UpdateMemberRoleResponse>(
      `${ORGANIZATIONS_PATH}/${organizationId}/members/${userId}`,
      { method: 'PATCH', body: input, authRecovery: true },
    );
  },

  removeMember(organizationId: string, userId: string): Promise<void> {
    return apiFetch<void>(
      `${ORGANIZATIONS_PATH}/${organizationId}/members/${userId}`,
      { method: 'DELETE', authRecovery: true },
    );
  },
};
