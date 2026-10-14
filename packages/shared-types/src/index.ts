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
