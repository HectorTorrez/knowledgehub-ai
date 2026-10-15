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
