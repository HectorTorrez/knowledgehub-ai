/**
 * Shared API contract types.
 *
 * These types describe the HTTP contracts exchanged between the frontend and
 * the backend. They are deliberately decoupled from backend domain models and
 * only expose what a client needs to consume an endpoint.
 */

/** Response body of `GET /health` on the API. */
export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

/** Generic error shape returned by the API for failed requests. */
export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
}

/**
 * Public view of a user account. Deliberately excludes credentials and other
 * server-only fields; this is the only user shape the API may return.
 */
export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response body of `POST /auth/register`.
 *
 * Access and refresh tokens are delivered as HttpOnly cookies, never in the
 * body, so they are intentionally absent here.
 */
export interface RegisterResponse {
  user: PublicUser;
}

/**
 * Response body of `POST /auth/login`. Same public contract as registration:
 * credentials travel only as cookies, so the body carries just the profile.
 */
export interface LoginResponse {
  user: PublicUser;
}

/**
 * Response body of `POST /auth/refresh`. Rotating the refresh token issues new
 * cookies, so as with the other auth flows the body carries only the profile.
 */
export interface RefreshResponse {
  user: PublicUser;
}

/**
 * A user's role within an organization.
 *
 * Deliberately a plain string union rather than the backend's persistence enum,
 * so the HTTP contract does not depend on generated database types.
 */
export type OrganizationRole = 'OWNER' | 'MEMBER';

/**
 * Public view of an organization from the perspective of the requesting user,
 * carrying the requesting user's role in it. This is the only organization
 * shape the API may return; it never exposes persistence-only fields.
 */
export interface OrganizationSummary {
  id: string;
  name: string;
  role: OrganizationRole;
  createdAt: string;
  updatedAt: string;
}

/** Response body of `GET /organizations`: the organizations the user belongs to. */
export interface OrganizationListResponse {
  organizations: OrganizationSummary[];
}

/** Response body of `POST /organizations` and `GET /organizations/:id`. */
export interface OrganizationDetailResponse {
  organization: OrganizationSummary;
}

/**
 * A member of an organization. Exposes only the profile fields a client needs
 * to render a member list alongside the member's role; `createdAt` is when the
 * membership was created (the join date).
 */
export interface OrganizationMember {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: OrganizationRole;
  createdAt: string;
}

/** Response body of `GET /organizations/:organizationId/members`. */
export interface MemberListResponse {
  members: OrganizationMember[];
}

/** Request body of `POST /organizations`. */
export interface CreateOrganizationRequest {
  name: string;
}

/** Request body of `POST /organizations/:organizationId/members`. */
export interface AddMemberRequest {
  email: string;
  role: OrganizationRole;
}

/** Request body of `PATCH /organizations/:organizationId/members/:userId`. */
export interface UpdateMemberRoleRequest {
  role: OrganizationRole;
}
