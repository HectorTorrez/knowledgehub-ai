import type {
  AddMemberRequest,
  AddMemberResponse,
  CreateOrganizationRequest,
  MemberListResponse,
  OrganizationDetailResponse,
  OrganizationListResponse,
  UpdateMemberRoleRequest,
  UpdateMemberRoleResponse,
} from '@knowledgehub/shared-types';
import { apiFetch } from './client';

const ORGANIZATIONS_PATH = '/organizations';

export const organizationsApi = {
  list(): Promise<OrganizationListResponse> {
    return apiFetch<OrganizationListResponse>(ORGANIZATIONS_PATH, {
      authRecovery: true,
    });
  },

  create(input: CreateOrganizationRequest): Promise<OrganizationDetailResponse> {
    return apiFetch<OrganizationDetailResponse>(ORGANIZATIONS_PATH, {
      method: 'POST',
      body: input,
      authRecovery: true,
    });
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
