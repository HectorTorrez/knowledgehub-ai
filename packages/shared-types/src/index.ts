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

/** A user's role within an organization. */
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

/**
 * Request body of `POST /organizations/:organizationId/members`.
 *
 * Only the invitee's email is accepted. The organization comes from the route
 * and the caller's identity from the session; the new member's role is always
 * `MEMBER`, so no role, user id or organization id is part of this contract.
 */
export interface AddMemberRequest {
  email: string;
}

/**
 * Response body of `POST /organizations/:organizationId/members`: the newly
 * created membership in the same public shape used by the member list.
 */
export interface AddMemberResponse {
  member: OrganizationMember;
}

/** Request body of `PATCH /organizations/:organizationId/members/:userId`. */
export interface UpdateMemberRoleRequest {
  role: OrganizationRole;
}

/**
 * Response body of `PATCH /organizations/:organizationId/members/:userId`: the
 * updated membership in the same public shape used by the member list.
 */
export interface UpdateMemberRoleResponse {
  member: OrganizationMember;
}

/**
 * Processing lifecycle of a document. `PENDING` means registered but not yet
 * uploaded or processed; the remaining states describe the processing pipeline,
 * which is not implemented yet, so every document currently stays `PENDING`.
 */
export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

/**
 * Public view of a document. Carries metadata only: file coordinates
 * (`originalFileName`, `contentType`, `sizeBytes`) are null until an upload is
 * confirmed, and persistence-only fields (`storageKey`, `uploadedById`,
 * `failureReason`) are deliberately absent — this is the only document shape
 * the API may return.
 */
export interface DocumentSummary {
  id: string;
  title: string;
  status: DocumentStatus;
  originalFileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Response body of `GET /organizations/:organizationId/documents`. */
export interface DocumentListResponse {
  documents: DocumentSummary[];
}

/** Response body of `POST` and `GET /organizations/:organizationId/documents[/:documentId]`. */
export interface DocumentDetailResponse {
  document: DocumentSummary;
}

/**
 * Request body of `POST /organizations/:organizationId/documents`.
 *
 * Only the title is accepted. The organization comes from the route, the
 * uploader from the session, and the status starts at `PENDING`, so no
 * organization id, uploader id, status, or file metadata is part of this
 * contract.
 */
export interface CreateDocumentRequest {
  title: string;
}

export interface DocumentUploadUrlRequest {
  contentType: string;
  sizeBytes?: number;
}

export interface DocumentUploadUrlResponse {
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
  maxSizeBytes: number;
}
