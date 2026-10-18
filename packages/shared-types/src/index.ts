/** Response body of `GET /health` on the API. */
export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

/**
 * Generic error shape returned by the API for failed requests.
 *
 * `message` is a single string for most failures. It is an array of field-level
 * messages when request validation fails, because Nest's `BadRequestException`
 * is thrown with the list of Zod issues. `error` is the HTTP status text, and is
 * present for the built-in Nest exceptions.
 */
export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
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
 * Request body of `POST /auth/register`. The account fields are the only
 * accepted input: the server owns ids, timestamps, and the initial session.
 */
export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
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
 * Request body of `POST /auth/login`. Credentials are the only accepted input.
 */
export interface LoginRequest {
  email: string;
  password: string;
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
 * Response body of `GET /auth/session`. A read-only check of the current
 * cookie-backed session: it returns the profile for a live session and never
 * rotates tokens or issues cookies.
 */
export interface SessionResponse {
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
 * verified; `PROCESSING` means the uploaded bytes are verified and promoted to
 * server-controlled storage and a durable processing job exists; `READY` means
 * the processing pipeline completed; `FAILED` means it failed (see
 * `DocumentFailureKind`).
 */
export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

/**
 * Which stage a `FAILED` document failed in: `VERIFICATION` for an upload that
 * failed the storage verification boundary, `PROCESSING` for a verified document
 * whose processing failed. Null unless `status` is `FAILED`.
 */
export type DocumentFailureKind = 'VERIFICATION' | 'PROCESSING';

/**
 * Public view of a document. Carries metadata only: file coordinates
 * (`originalFileName`, `contentType`, `sizeBytes`) are null until an upload is
 * verified, and persistence-only fields (`storageKey`, `uploadStorageKey`,
 * `uploadedById`) are deliberately absent — this is the only document shape
 * the API may return. `failureReason` is a sanitized, fixed-vocabulary string
 * populated only when a document fails; `failureKind` says whether it was an
 * upload-verification failure or a processing failure. Neither carries internal
 * diagnostics.
 */
export interface DocumentSummary {
  id: string;
  title: string;
  status: DocumentStatus;
  originalFileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  failureReason: string | null;
  failureKind: DocumentFailureKind | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response body of `GET /organizations/:organizationId/documents`.
 *
 * `nextCursor` is an opaque, server-issued keyset cursor. Pass it back as
 * `cursor` on the next request to fetch the following page; it is `null` when
 * there are no further documents.
 */
export interface DocumentListResponse {
  documents: DocumentSummary[];
  nextCursor: string | null;
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

/**
 * Request body of `PATCH /organizations/:organizationId/documents/:documentId`.
 *
 * Only the title may change. Status, generation, file coordinates, and storage
 * keys are server-derived and absent from this contract.
 */
export interface UpdateDocumentRequest {
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

/**
 * Request body of
 * `POST /organizations/:organizationId/documents/:documentId/upload-complete`.
 *
 * The client reports that it finished uploading and may declare a display name.
 * `originalFileName` is the only acceptable field and is treated as unverified
 * declared metadata: verified `contentType`, `sizeBytes`, `status`, and the
 * storage keys are all server-derived and absent from this contract.
 */
export interface DocumentUploadCompleteRequest {
  originalFileName?: string;
}

/**
 * Request body of `POST /organizations/:organizationId/answers`.
 *
 * Only the question is accepted. The organization comes from the route and the
 * caller's identity from the session, so no organization id, document id, or
 * retrieval option is part of this contract.
 */
export interface AnswerRequest {
  question: string;
}

/**
 * One retrieved source an answer cites. `marker` is the number used inside the
 * answer text, so a client can render the marker without renumbering. `excerpt`
 * is derived from the cited chunk on the server, never from model output.
 */
export interface AnswerCitation {
  marker: number;
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  chunkIndex: number;
  excerpt: string;
}

/**
 * Response body of `POST /organizations/:organizationId/answers`.
 *
 * `answered` carries a grounded answer whose citation markers all resolve to
 * returned citations. `insufficient_evidence` is a successful outcome for a
 * question the retrieved sources cannot answer; it carries no answer prose and
 * no citations.
 */
export type AnswerResponse =
  | {
      status: 'answered';
      answer: string;
      citations: AnswerCitation[];
    }
  | {
      status: 'insufficient_evidence';
      answer: null;
      citations: AnswerCitation[];
    };
