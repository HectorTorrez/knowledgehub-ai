# KnowledgeHub AI

Multi-tenant RAG SaaS. A pnpm + Turborepo monorepo:

- `apps/api` — NestJS backend (owns all business logic and database access).
- `apps/web` — TanStack Start frontend (talks to the API over HTTP).
- `packages/*` — shared TypeScript, ESLint, and contract types.

## Prerequisites

- Node.js 24 (`nvm use`)
- pnpm 11 (`corepack enable` then `pnpm -v`)
- Docker with the Compose plugin (for local PostgreSQL and MinIO object storage)

## Setup

```bash
pnpm install

# Environment files (never committed).
cp .env.example .env                 # Postgres and MinIO credentials for Compose
cp apps/api/.env.example apps/api/.env
```

`POSTGRES_*` in the root `.env` and `DATABASE_URL` in `apps/api/.env` must point
at the same database. The example values already match; adjust both together if
you change them.

`apps/api/.env` also needs a `JWT_ACCESS_SECRET` (at least 32 characters). The
example file ships a placeholder; replace it with a unique value per environment:

```bash
openssl rand -base64 48   # paste into JWT_ACCESS_SECRET
```

The example enables the local browser (cookie) authentication flow via
`BROWSER_AUTH_ENABLED=true`, which also requires a `CSRF_SECRET` of at least 32
characters. Generate a unique one per environment the same way. See
`apps/api/.env.example` for every available setting.

`apps/api/.env` also configures object storage (`STORAGE_*`). Its defaults match
the local MinIO service in the root `.env`; keep `STORAGE_ACCESS_KEY_ID` and
`STORAGE_SECRET_ACCESS_KEY` equal to `MINIO_ROOT_USER` and
`MINIO_ROOT_PASSWORD`. See [Local object storage](#local-object-storage-minio-via-docker-compose).

## Local database (PostgreSQL via Docker Compose)

The database runs in a container; the apps run on the host. Credentials come
from the root `.env`, and data is kept in the named volume
`knowledgehub-postgres-data` so it survives restarts.

```bash
# 1. Start PostgreSQL (in the background).
pnpm db:up

# 2. Check health — wait until STATUS shows "healthy".
pnpm db:health

# 3. Apply Prisma migrations and regenerate the client.
pnpm db:migrate            # create/apply migrations in development
pnpm db:migrate:deploy     # apply existing migrations (CI / production)

# 4. Stop PostgreSQL without deleting data.
pnpm db:down               # data stays in the named volume

# 5. Intentionally reset the local database (DESTROYS all local data).
pnpm db:reset
```

Other useful commands:

```bash
pnpm db:logs               # follow Postgres logs
pnpm db:migrate:status     # migration state
pnpm db:studio             # browse data (Prisma Studio)
```

## Local object storage (MinIO via Docker Compose)

Documents are stored in S3-compatible object storage: MinIO locally and
Cloudflare R2 in production. Local MinIO runs in a container alongside Postgres,
and a one-shot `minio-init` service waits until MinIO is healthy, creates the
documents bucket, and applies its CORS policy. Initialization is idempotent, so
it is safe to run repeatedly.

```bash
# 1. Start MinIO and run its initializer (in the background).
pnpm storage:up

# 2. Check health — wait until STATUS shows "healthy".
pnpm storage:health

# 3. Stop MinIO without deleting data.
pnpm storage:down
```

Other useful commands:

```bash
pnpm storage:logs          # follow MinIO logs
```

The bucket name and the browser origin allowed to upload to it come from the
root `.env` (`STORAGE_BUCKET`, `STORAGE_CORS_ORIGIN`). `STORAGE_CORS_ORIGIN`
must match the frontend origin and the API's `CORS_ORIGIN` in `apps/api/.env`;
the CORS policy allows only `PUT` with `Content-Type` from that origin. Both
MinIO ports bind to `127.0.0.1` only: the S3-compatible API on
http://127.0.0.1:9000 and the web console on http://127.0.0.1:9001.

Object storage credentials here are local development values from the ignored
root `.env`. They are **not** suitable for production, which uses Cloudflare R2
with its own credentials. Successful initialization proves the bucket and CORS
policy were applied; it does not prove a browser can upload with a presigned
URL (see [Limitations](#limitations)).

The Compose services read these variables from the root `.env`:

| Variable                | Purpose                                            | Default                  |
| ----------------------- | -------------------------------------------------- | ------------------------ |
| `MINIO_ROOT_USER`       | MinIO root user, reused as `STORAGE_ACCESS_KEY_ID` | required                 |
| `MINIO_ROOT_PASSWORD`   | MinIO root password, reused as the secret key      | required                 |
| `MINIO_API_PORT`        | Host port for the S3-compatible API                | `9000`                   |
| `MINIO_CONSOLE_PORT`    | Host port for the MinIO web console                | `9001`                   |
| `STORAGE_BUCKET`        | Bucket the initializer creates and applies CORS to | `knowledgehub-documents` |
| `STORAGE_CORS_ORIGIN`   | Frontend origin allowed to `PUT` to the bucket     | `http://localhost:3000`  |

`apps/api/.env` holds the API's own storage settings, which must match the
MinIO service: `STORAGE_BUCKET`, `STORAGE_ENDPOINT`
(`http://127.0.0.1:9000`), `STORAGE_REGION`, `STORAGE_FORCE_PATH_STYLE`
(`true` for MinIO), `STORAGE_UPLOAD_TTL_SECONDS` (presigned-URL lifetime),
`STORAGE_ACCESS_KEY_ID` and `STORAGE_SECRET_ACCESS_KEY`. Keep
`STORAGE_ACCESS_KEY_ID` equal to `MINIO_ROOT_USER` and
`STORAGE_SECRET_ACCESS_KEY` equal to `MINIO_ROOT_PASSWORD`. The API fails to
start if any of these is missing.

## Development

```bash
pnpm dev        # starts the API (watch) and the web app together
```

`pnpm dev` only starts the applications; it never touches the database's or
storage's contents. Run `pnpm db:up` and `pnpm db:migrate` first, then
`pnpm storage:up`: the upload endpoint issues presigned URLs against the local
MinIO bucket.

Quality gates:

```bash
pnpm lint
pnpm check-types
pnpm test
pnpm build
```

The Prisma client is generated into `apps/api/src/generated/prisma` (git-ignored)
and is recreated automatically before `dev`, `build`, `check-types`, and `test`.

## Authentication

The `auth` module owns the credential lifecycle:

```
POST /auth/register   { email, password, firstName, lastName }  -> 201 { user }
POST /auth/login      { email, password }                       -> 200 { user }
POST /auth/refresh                                              -> 200 { user }
POST /auth/logout                                               -> 204
```

Tokens are issued as `HttpOnly` cookies (with bearer tokens supported as an
alternative) and refresh tokens rotate on every use. Configure lifetimes, cookie
behavior, browser auth, and CSRF through `apps/api/.env`; see
`apps/api/.env.example` for the full list.

## Organizations and membership

Every organization endpoint requires an authenticated session: send the access
token as `Authorization: Bearer <token>` or as the `HttpOnly` access cookie.
Unauthenticated requests return `401`. Responses follow the
`@knowledgehub/shared-types` contracts and never expose persistence-only fields.

```
POST   /organizations
GET    /organizations
GET    /organizations/:organizationId
GET    /organizations/:organizationId/members
POST   /organizations/:organizationId/members
PATCH  /organizations/:organizationId/members/:userId
DELETE /organizations/:organizationId/members/:userId
```

Tenant routes (`/:organizationId` and below) additionally require membership in
that organization. Membership is read from the database on every request, so a
revoked membership stops working immediately. A caller who is not a member — or
an id that does not exist — gets `403`, which deliberately does not reveal
whether the organization exists; a malformed `:organizationId` or `:userId`
gets `400`.

### POST /organizations → 201

Body `{ "name": string }` (trimmed, 1–100 characters; unknown fields are
rejected with `400`). The caller is created as the organization's `OWNER`.
Returns `{ organization }` (`OrganizationDetailResponse`).

### GET /organizations → 200

Returns `{ organizations }` (`OrganizationListResponse`): only the
organizations the caller belongs to, each carrying the caller's role, ordered by
creation time then id.

### GET /organizations/:organizationId → 200

Returns `{ organization }` (`OrganizationDetailResponse`) with the caller's role.

### GET /organizations/:organizationId/members → 200

Any member (OWNER or MEMBER) may call this. Returns `{ members }`
(`MemberListResponse`), ordered by join date then user id.

### POST /organizations/:organizationId/members → 201

OWNER only; a MEMBER gets `403`. Body `{ "email": string }`, normalized the same
way as registration. The existing user is added as a `MEMBER`; the response is
`{ member }` (`AddMemberResponse`). Returns `404` when no user has that email and
`409` when the user is already a member.

### PATCH /organizations/:organizationId/members/:userId → 200

OWNER only. Body `{ "role": "OWNER" | "MEMBER" }`. Returns `{ member }`
(`UpdateMemberRoleResponse`). Returns `404` when the target is not a member of
this organization and `409` when the change would leave the organization without
an owner.

### DELETE /organizations/:organizationId/members/:userId → 204

OWNER only. Responds `204 No Content` with an empty body. Returns `404` when the
target is not a member and `409` when removing the target would leave the
organization without an owner.

### Ownership and contention

Every organization must keep at least one `OWNER`. This is an
application-enforced invariant, not a database constraint or trigger: each
membership mutation locks the organization row (`SELECT ... FOR UPDATE`),
revalidates the caller's `OWNER` role inside the transaction, then reads or
changes memberships. The invariant is documented on the `Organization` model in
`apps/api/prisma/schema.prisma`.

Membership mutations run with explicit transaction limits (2000 ms to acquire a
pooled connection, 5000 ms once the transaction has started). Immediately before
locking the organization row, each mutation sets a transaction-local PostgreSQL
`lock_timeout` of 1000 ms (`set_config('lock_timeout', '1000ms', true)`); the
setting reverts when the transaction ends and never leaks to the pooled
connection. A contended lock wait therefore fails as a PostgreSQL lock timeout
(`55P03`) within about a second instead of occupying a pooled connection until
the holder finishes. Reliably recognised transaction-contention or timeout
failures — a PostgreSQL lock timeout (`55P03`), a deadlock or serialization
failure (`40P01` / `40001`), or an interactive-transaction timeout — return `503
Service Unavailable`. The API does not retry mutations automatically.

Failed requests use the `ApiErrorResponse` shape `{ statusCode, message, error? }`.

## Documents

Documents are files registered within a single organization. This section
covers metadata registration and upload-URL issuance; verifying an uploaded
object and processing it are not implemented yet (see
[Limitations](#limitations)).

Every document endpoint requires an authenticated session and membership in the
organization named in the route. Authentication and membership work exactly as
described under [Organizations and membership](#organizations-and-membership):
an unauthenticated request returns `401`, an authenticated non-member returns
`403` (without revealing whether the organization exists), and a malformed
`:organizationId` or `:documentId` returns `400`.

```
POST /organizations/:organizationId/documents
GET  /organizations/:organizationId/documents
GET  /organizations/:organizationId/documents/:documentId
POST /organizations/:organizationId/documents/:documentId/upload-url
```

Any organization member — `OWNER` or `MEMBER` — may create, list, and read
documents. A document belongs to its organization, not to the user who
registered it: the uploader is recorded for provenance only and never scopes
access.

### POST /organizations/:organizationId/documents → 201

Body `{ "title": string }` (trimmed, 1–200 characters; unknown fields are
rejected with `400`). The organization comes from the route, the uploader from
the session, and the status always starts at `PENDING`. Returns `{ document }`
(`DocumentDetailResponse`).

### GET /organizations/:organizationId/documents → 200

Returns `{ documents }` (`DocumentListResponse`) — only the documents belonging
to the organization — ordered by creation time descending, then id descending.

### GET /organizations/:organizationId/documents/:documentId → 200

Returns `{ document }` (`DocumentDetailResponse`). The document is looked up by
both id and organization, so a document that exists only in another
organization returns `404`.

### POST /organizations/:organizationId/documents/:documentId/upload-url → 200

Any organization member may request an upload URL for a document in the
organization. The document is looked up by id and organization, so a document
that exists only in another organization — or does not exist — returns `404`.
Body `{ "contentType": string, "sizeBytes"?: number }`:

- `contentType` must be one of `application/pdf`, `text/plain`, or
  `text/markdown`; anything else returns `400`.
- `sizeBytes` is optional, must be a positive integer, and must not exceed
  `2_000_000_000` (the policy cap). A value above the cap returns `413 Payload
  Too Large`; a non-integer, zero, or negative value returns `400`.
- Unknown body fields return `400`.

Returns exactly `{ uploadUrl, method, headers, expiresAt, maxSizeBytes }`
(`DocumentUploadUrlResponse`): the presigned `PUT` URL, the `PUT` method, the
`Content-Type` header to send with the upload, the URL expiry as an ISO-8601
string, and the maximum accepted size. No storage key is returned. `expiresAt`
follows `STORAGE_UPLOAD_TTL_SECONDS` (900 seconds by default).

### Upload-URL lifecycle and limitations

Requesting a URL creates a fresh staging key of the form
`organizations/<organizationId>/documents/<documentId>/<random token>`,
generates the presigned URL from it, and records the key as the document's
staging `uploadStorageKey`. Requesting another URL supersedes the previously
recorded staging key: every request generates a distinct key, and only the newest
one is recorded, so an upload sent to an older URL is not the object later phases
will verify. The verified `storageKey` stays null until Phase 5.2B verification
promotes the uploaded object to a server-controlled key.

The presigned `PUT` is a direct browser-to-storage transfer that bypasses the
API, so every value the client declares is untrusted:

- `sizeBytes` is only a declared maximum. A presigned `PUT` cannot enforce a
  request-body size, so the client may upload more (or less) than it declared.
- `contentType` is signed into the URL and sent as the `Content-Type` header,
  but the storage provider does not inspect the bytes, so the body's real type
  may differ from the declared one.

A successful request therefore records only the staging key. The document stays
`PENDING` and `originalFileName`, `contentType`, and `sizeBytes` remain `null`
until Phase 5.2B reads the uploaded object and verifies its real size, type, and
contents; only then can a document leave `PENDING`. Persisting the key does not
mean an object exists — the URL may never be used. If persisting the key fails
after the URL is generated, the request fails and the URL is not returned.

### Response contract

`DocumentSummary` exposes only `id`, `title`, `status`, `originalFileName`,
`contentType`, `sizeBytes`, `createdAt`, and `updatedAt`. The processing
`status` is one of `PENDING`, `PROCESSING`, `READY`, or `FAILED`. The file
metadata fields (`originalFileName`, `contentType`, `sizeBytes`) are `null`
until an upload is confirmed. Persistence-only fields — `storageKey`,
`uploadedById`, and `failureReason` — are never returned.

### Limitations

- **Uploads are issued but not verified.** `POST …/upload-url` hands out a
  presigned `PUT`, but nothing confirms the object was uploaded. The only status
  a document can reach today is `PENDING`; Phase 5.2B adds verification and the
  `PROCESSING`, `READY`, and `FAILED` pipeline.
- **Listing is unpaginated.** `GET …/documents` returns every document in the
  organization in one response. Pagination is deferred; large organizations
  will need it.
- **Documents cannot be deleted or renamed** in this increment.

