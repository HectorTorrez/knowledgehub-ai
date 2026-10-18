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

Document processing is off by default: with `PROCESSING_WORKER_ENABLED=false`
nothing consumes the queue. Set `PROCESSING_WORKER_ENABLED=true` in
`apps/api/.env` to run the in-process worker that extracts queued documents.

Quality gates:

```bash
pnpm lint
pnpm check-types
pnpm test
pnpm build
```

The Prisma client is generated into `apps/api/src/generated/prisma` (git-ignored)
and is recreated automatically before `dev`, `build`, `check-types`, and `test`.

The API's end-to-end suite runs against the local PostgreSQL instance:

```bash
pnpm db:up
pnpm --filter @knowledgehub/api test:e2e
```

To additionally exercise the real object-storage adapter against local MinIO
(presigned upload, version-bound read, and promotion), start MinIO and opt in:

```bash
pnpm storage:up
STORAGE_INTEGRATION=true pnpm --filter @knowledgehub/api test:e2e
```

The integration check is skipped unless `STORAGE_INTEGRATION=true`, so the
default suite needs no running object storage.

The grounded-answer evaluation is also opt-in. It is excluded from `pnpm test`
and `pnpm test:e2e`, requires a real provider key, and is documented under
[Evaluation](#evaluation).

## Authentication

The `auth` module owns the credential lifecycle:

```
POST /auth/register   { email, password, firstName, lastName }  -> 201 { user }
POST /auth/login      { email, password }                       -> 200 { user }
GET  /auth/session                                              -> 200 { user } | 401
POST /auth/refresh                                              -> 200 { user }
POST /auth/logout                                               -> 204
```

`GET /auth/session` is a read-only check of the current cookie-backed session.
It returns the authenticated user's public profile, never rotates tokens or
issues cookies, and returns `401` for a missing, invalid, expired, or revoked
session.

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

## Rate limiting and quotas

Requests that spend money or CPU are rate-limited, and answer generation is
additionally bounded by a persisted per-tenant daily quota.

- `POST /auth/login` and `POST /auth/register` are limited **per IP** (default
  10/minute).
- `GET /organizations/:organizationId/search` is limited **per organization**
  (default 60/minute).
- `POST /organizations/:organizationId/answers` is limited **per user** (default
  5/minute) and **per organization** (default 20/minute).
- Answer generation is capped by a **daily quota per organization** (default
  1000/day). Unlike the rate limits, the quota is persisted in the database
  (`TenantUsage`) so it survives restarts and applies across instances.

Exceeding a rate limit returns `429 Too Many Requests` with the standard
`ApiErrorResponse` envelope and a `Retry-After` header (seconds until the window
resets). Exceeding the daily answer quota returns `429` with the same envelope.
The daily quota counts only answer requests that reached the completion step;
requests that found no sources are not counted.

Rate limits are enforced in the API process and are per-instance; the tenant
quota is the durable cost-control boundary. All limits are configuration, not
code: see `apps/api/.env.example` for `RATE_LIMIT_*` and `QUOTA_ANSWER_DAILY`.

## Documents

Documents are files registered within a single organization. This section
covers metadata registration, upload-URL issuance, upload verification, and the
worker that extracts a verified document's text.

Every document endpoint requires an authenticated session and membership in the
organization named in the route. Authentication and membership work exactly as
described under [Organizations and membership](#organizations-and-membership):
an unauthenticated request returns `401`, an authenticated non-member returns
`403` (without revealing whether the organization exists), and a malformed
`:organizationId` or `:documentId` returns `400`.

```
POST   /organizations/:organizationId/documents
GET    /organizations/:organizationId/documents
GET    /organizations/:organizationId/documents/:documentId
PATCH  /organizations/:organizationId/documents/:documentId
DELETE /organizations/:organizationId/documents/:documentId
POST   /organizations/:organizationId/documents/:documentId/upload-url
POST   /organizations/:organizationId/documents/:documentId/upload-complete
```

Any organization member — `OWNER` or `MEMBER` — may create, list, read, rename,
delete, upload, and complete documents. A document belongs to its organization,
not to the user who registered it: the uploader is recorded for provenance only
and never scopes access.

### POST /organizations/:organizationId/documents → 201

Body `{ "title": string }` (trimmed, 1–200 characters; unknown fields are
rejected with `400`). The organization comes from the route, the uploader from
the session, and the status always starts at `PENDING`. Returns `{ document }`
(`DocumentDetailResponse`).

### GET /organizations/:organizationId/documents → 200

Returns `{ documents, nextCursor }` (`DocumentListResponse`) — the documents
belonging to the organization, ordered by creation time descending, then id
descending, keyset-paginated. The optional `limit` query parameter caps the page
size (1–100, default 25); the optional `cursor` query parameter is the opaque
`nextCursor` of the previous page. `nextCursor` is `null` on the last page.

### GET /organizations/:organizationId/documents/:documentId → 200

Returns `{ document }` (`DocumentDetailResponse`). The document is looked up by
both id and organization, so a document that exists only in another
organization returns `404`.

### PATCH /organizations/:organizationId/documents/:documentId → 200

Body `{ "title": string }` (trimmed, 1–200 characters; unknown fields are
rejected with `400`). Renames the document and returns `{ document }`
(`DocumentDetailResponse`). A document in another organization — or one that
does not exist — returns `404`.

### DELETE /organizations/:organizationId/documents/:documentId → 204

Permanently deletes the document, its extracted text and chunks, its processing
jobs, and its staging and verified objects. A document in another organization —
or one that does not exist — returns `404`. Object deletion is best-effort: if
storage deletion fails the object is left for the garbage-collection sweep, but
the document row is still removed.

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

A URL can only be requested while the document is `PENDING` or `FAILED`. A
`PROCESSING` or `READY` document returns `409`: once the verified bytes exist,
issuing another upload URL would only create a pointless orphaned staging
object, so the lifecycle is closed.

Requesting a URL creates a fresh staging key of the form
`organizations/<organizationId>/documents/<documentId>/<random token>`,
generates the presigned URL from it, and records the key as the document's
staging `uploadStorageKey` together with the requested `contentType` as
`expectedContentType`. Requesting another URL supersedes the previously recorded
staging key: every request generates a distinct key, and only the newest one is
recorded, so an upload sent to an older URL is not the object completion
verifies. The verified `storageKey` is never touched here.

The presigned `PUT` is a direct browser-to-storage transfer that bypasses the
API, so every value the client declares is untrusted:

- `sizeBytes` is only a declared maximum. A presigned `PUT` cannot enforce a
  request-body size, so the client may upload more (or less) than it declared.
- `contentType` is signed into the URL and sent as the `Content-Type` header,
  but the storage provider does not inspect the bytes, so the body's real type
  may differ from the declared one.

Persisting the key does not mean an object exists — the URL may never be used.
If persisting the key fails after the URL is generated, the request fails and
the URL is not returned.

### POST /organizations/:organizationId/documents/:documentId/upload-complete → 200

Reports that the client finished uploading and asks the API to verify the
object. The document is looked up by id and organization, so a document that
exists only in another organization — or does not exist — returns `404`.

Body is optional: `{ "originalFileName"?: string }` (trimmed, 1–255 characters,
no control characters; unknown fields return `400`). `originalFileName` is the
only client-supplied value and is **declared display metadata only** — it is
never used to decide anything about the object. The client cannot send
`contentType`, `sizeBytes`, `status`, or any storage key.

Completion never inspects or promotes a client-chosen key. It always reads the
staging `uploadStorageKey` the API itself persisted, then:

1. inspects the staging object and reads a bounded byte prefix from the same
   object version;
2. checks the real size (`0 < size ≤ 2_000_000_000`), that the real content type
   is allowlisted and matches `expectedContentType`, and that the bytes carry the
   type's signature;
3. copies the verified bytes to a fresh server-controlled key
   (`organizations/<organizationId>/documents/<documentId>/verified/<random
   token>`) and confirms the promoted object;
4. only then, in a single database transaction, transitions the document
   atomically to `PROCESSING`, increments its processing `generation` exactly
   once, records the **verified** content type and size, clears any previous
   failure reason, and creates the durable processing job for that exact
   generation and verified key.

Both a successful and a definitive-failure outcome return `200 { document }`
(`DocumentDetailResponse`); the document's `status` is the source of truth.

| Condition | Code | State change |
| --- | --- | --- |
| Verified, valid object, promoted | `200` | `PENDING`/`FAILED` → `PROCESSING` |
| Definitive policy violation | `200` (`status: FAILED`) | → `FAILED` with a sanitized reason |
| No upload URL requested yet | `409` | none |
| Object absent at the staging key | `409` | none |
| Object changed during verification | `409` | none (retriable) |
| Upload superseded by a newer URL | `409` | none (retriable) |
| Already `PROCESSING`/`READY` | `200` | none (idempotent) |
| Transient storage failure | `503` | none (retriable) |
| Not a member / not authenticated / malformed | `403` / `401` / `400` | none |

A definitive failure stores one of a fixed vocabulary of reasons in
`failureReason` and sets `failureKind` to `VERIFICATION`: `EMPTY_OBJECT`,
`SIZE_LIMIT_EXCEEDED`, `CONTENT_TYPE_NOT_ALLOWED`, `CONTENT_TYPE_MISMATCH`, or
`SIGNATURE_MISMATCH`. Missing objects, version changes, supersession, and
transient faults never set a reason or change the status. Repeating completion on
a `PROCESSING` or `READY` document is a pure no-op: no inspection, promotion,
metadata rewrite, key change, or enqueue.

### Staging keys versus verified keys

Two keys, two trust levels, two columns:

- `uploadStorageKey` is the **staging** key. It is the only key a presigned
  `PUT` can write, it is client-writable and untrusted, and nothing downstream
  reads it.
- `storageKey` is the **verified** key. It is server-controlled, never signed
  and never returned to a client, written only by promoting a staging object
  during verification, and it is the key every later phase will read.

Inspection, the prefix read, and the copy are all bound to a single object
version, so the promoted bytes are provably the bytes that were checked even if
the client overwrites the staging object mid-flight. Once written, the verified
object is immutable for our purposes: a reused (still-valid) presigned URL can
overwrite only the staging object, which `storageKey` no longer references.

Because the promoted object is written before the database row is updated, a
failed or racing database write can leave an **orphaned verified object** with
no document pointing at it. The object's existence is never treated as proof
that a document was accepted — the conditional database update is what accepts
it. Document deletion and each superseded staging upload remove their objects
eagerly; a periodic sweep for objects orphaned by a crash mid-promotion is
still deferred (see [Limitations](#limitations)).

### What verification checks — and what it does not

- **Size** is the object's real size, bounded by the policy cap.
- **Content type** is the stored `Content-Type`, which must be allowlisted and
  match the type the URL was signed for.
- **Signature** is a bounded structural check only: a PDF must contain `%PDF-`
  within its first 1024 bytes, and text must decode as strict UTF-8 with no NUL
  byte.
- It does **not** prove the file is a valid, safe, or parseable document. The
  PDF magic-byte check is not PDF validation, and decoding text as UTF-8 is
  structural, not semantic. Antivirus scanning and content sanitization are out
  of scope.

### Processing

Once verification promotes a document to `PROCESSING`, its durable job carries
the exact verified generation and storage key. A dedicated worker consumes the
queue when `PROCESSING_WORKER_ENABLED=true`; it runs in-process with the API and
starts and stops with the application. It is disabled by default, so nothing
consumes the queue unless it is explicitly switched on.

Each iteration the worker recovers expired leases, claims one due job atomically
(`FOR UPDATE SKIP LOCKED`), renews that job's lease while it works, reads the
verified object bound to its inspected version, and extracts text:

- `text/plain` and `text/markdown` decode as strict UTF-8;
- `application/pdf` extracts embedded text with `unpdf`, preserving the page each
  passage came from.

Extraction is bounded before its output is used: an object above 25 MiB is
rejected without being read, and a PDF above 500 pages or text above 2,000,000
characters is rejected after parsing. Those limits are deliberately far below the
2 GB upload limit, but they are input-size bounds only: see the limitations
below for what they do not guarantee.

Ingestion is fenced and completes the lifecycle. The page-attributed extracted
text is written to `DocumentExtraction` as an array of `{ pageNumber, content }`
pages (plus `pageCount` and `characterCount`), keyed by
`[documentId, documentGeneration]`. Before that, the same generation is chunked
and embedded: page-scoped chunks are stored in `DocumentChunk` with a
1536-dimension `pgvector` embedding per chunk. Chunk writes replace the
generation and clear older generations of the same document, so a retry never
appends duplicates.

The worker only advances the document after its chunks are stored. It calls
`DocumentChunkStore.replaceForGeneration` — embedding happens outside any
transaction, and the write revalidates the lease, generation, and `PROCESSING`
status under locks — and then `ProcessingJobService.publishExtraction` inserts
the extraction and sets the job `SUCCEEDED` and the document `READY` under the
same predicates (lease id, an unexpired lease, the job's generation and storage
key, and the document's organization, generation, storage key, and `PROCESSING`
status). A stale execution writes zero rows and its result is discarded, and a
document can only reach `READY` once its current generation's chunks are stored.

Failures are classified rather than blanket-retried. An unsupported content
type, an unparseable document, an exceeded size/page/character limit, a document
that exceeds the chunk budget, a document with no extractable text, a missing
verified object, a storage-integrity violation, or an embedding request the
provider rejects as invalid is
**permanent**: the job becomes `FAILED` and the document becomes `FAILED` with
`failureKind = PROCESSING` in the same transaction. A storage or database outage,
an embedding provider that is rate-limited or unreachable, a malformed embedding
response, a worker crash, or any error the worker cannot classify is
**retryable**: the job returns
to `QUEUED` with `nextAttemptAt = now() + 2s · 2^(attempt-1)` capped at 60
seconds, reusing the same row. `attempt` is incremented at claim, and a job with
`attempt >= maxAttempts` (5) that fails again — or whose lease expires while
exhausted — becomes terminal `FAILED`, and its document is failed too.

Leases last 60 seconds and are renewed while a job runs. Renewal matches the job
and lease ids and refuses to revive an expired lease. If a worker dies, its lease
expires and the recovery sweep requeues the job (or, when attempts are exhausted,
fails it and its document). Every terminal write is bounded by the job's
generation and verified key, so an old job can never change the status of a newer
document generation.

### Response contract

`DocumentSummary` exposes only `id`, `title`, `status`, `originalFileName`,
`contentType`, `sizeBytes`, `failureReason`, `failureKind`, `createdAt`, and
`updatedAt`. The processing `status` is one of `PENDING`, `PROCESSING`, `READY`,
or `FAILED`. `originalFileName`, `contentType`, and `sizeBytes` are `null` until
an upload is verified; after verification `contentType` and `sizeBytes` are the
verified values and `originalFileName` is the client's declared name, if
supplied. `failureReason` and `failureKind` are `null` unless the document
failed; `failureKind` is `VERIFICATION` for an upload that failed verification
and `PROCESSING` for a verified document whose processing failed, and
`failureReason` then holds only the sanitized vocabulary. A processing failure's
`failureReason` is one of `CONTENT_UNSUPPORTED`, `CONTENT_CORRUPT`,
`NO_EXTRACTABLE_TEXT`, `CONTENT_TOO_LARGE`, `VERIFIED_OBJECT_MISSING`,
`STORAGE_INTEGRITY_VIOLATION`, or `PROCESSING_FAILED`; it never carries an
exception message, SQL text, or a storage key, all of which stay in the job's
internal `lastError` and logs.
Persistence-only fields — `uploadStorageKey`, `storageKey`, and `uploadedById` —
are never returned.

### Limitations

- **`READY` now means ingested.** Processing extracts the text, splits it into
  page-scoped chunks, embeds each chunk, and only then marks the document
  `READY`. A document in `PROCESSING` is still being worked on. A document whose
  text yields no chunks, such as a scanned PDF with no extractable text layer,
  fails permanently with `NO_EXTRACTABLE_TEXT` and is excluded from retrieval.
  OCR is not part of this pipeline.
  Vector search uses an HNSW index (`vector_cosine_ops`), which is approximate:
  a near neighbor can be missed, and results with equal similarity are returned
  in arbitrary order. Recall is tuned through `hnsw.ef_search` at the database
  level rather than in application code.
- **Document text leaves the deployment for embedding.** Chunk text is sent to
  the configured provider (OpenAI `text-embedding-3-small` by default), and a
  search query is embedded the same way. `OPENAI_API_KEY` is required whenever
  `PROCESSING_WORKER_ENABLED=true` or `ANSWERS_ENABLED=true`;
  `EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS` must agree with the stored
  `vector(1536)` column, and a mismatch fails at startup.
- **PDF parsing is not sandboxed.** Extraction enforces deterministic size,
  page, and character limits, but the parser still runs synchronously in the API
  process. There is no execution-time or memory limit (a JavaScript timer cannot
  stop synchronous parsing) and no process or container isolation, so a hostile
  PDF can still exhaust CPU or memory. Untrusted production uploads at scale must
  run the parser in an isolated process with enforceable resource limits; that
  work is deferred.
- **Orphaned objects from a crash are swept opportunistically.** Document
  deletion and each superseded staging upload remove their objects eagerly, and
  an optional in-process sweep (`STORAGE_SWEEP_ENABLED`) deletes orphaned
  verified objects older than a grace period. An object's existence alone is
  never proof that a document was accepted.
- **The PDF signature check is not validation.** It only confirms the `%PDF-`
  header; it does not establish that the file is a valid or safe PDF.

## Search

`GET /organizations/:organizationId/search?q=<text>&limit=<n>` ranks an
organization's ready document chunks by embedding similarity to the query and
returns `{ results }` (`SearchResponse`), each result carrying the source
document id and title, the page number, the matching chunk's text as `excerpt`,
and a `score` (cosine similarity, higher is closer). `q` is required (trimmed,
1–2000 characters); `limit` defaults to 10 and caps at 50. Like the document
endpoints, it requires an authenticated session and membership: `401`
unauthenticated, `403` non-member, `400` for a malformed `:organizationId` or
blank query.

Search consumes the same retrieval pipeline as grounded answers but returns the
matched passages directly, with no model completion.

## Grounded answers

`POST /organizations/:organizationId/answers` answers a question from the
organization's ingested documents and attributes every claim to a source
document and page. Retrieval, context assembly, the provider call, and citation
validation happen inside the API; the client receives only the validated answer.

```
POST   /organizations/:organizationId/answers
GET    /organizations/:organizationId/answers
GET    /organizations/:organizationId/answers/:answerId
DELETE /organizations/:organizationId/answers/:answerId

POST   /organizations/:organizationId/conversations
GET    /organizations/:organizationId/conversations
GET    /organizations/:organizationId/conversations/:conversationId
DELETE /organizations/:organizationId/conversations/:conversationId
```

Every answer is persisted to the organization's history once a successful
outcome is produced; a page refresh no longer loses it. `GET …/answers` returns
`{ answers, nextCursor }` keyset-paginated summaries (question, outcome, and
timestamp), `GET …/answers/:answerId` returns the full answer and citations, and
`DELETE …/answers/:answerId` removes one entry. Failed requests are not
persisted.

A question may carry an optional `conversationId`. When present, the conversation
must belong to the same organization (`404` otherwise), and the most recent prior
turns are included in the prompt as quoted context — never as sources. Create a
conversation with `POST …/conversations`, list them with `GET …/conversations`,
and filter history with `GET …/answers?conversationId=…`. Deleting a conversation
cascades to its answers. History is bounded by `ANSWER_HISTORY_MAX_CHARS`.

The endpoint requires an authenticated session and membership in the
organization named in the route, exactly like the document endpoints:
unauthenticated requests return `401`, authenticated non-members return `403`
(without revealing whether the organization exists), and a malformed
`:organizationId` returns `400`. The organization comes only from the route: the
body cannot select documents, filters, or another organization.

### Feature flag

Answer generation is **disabled by default**. With `ANSWERS_ENABLED=false` the
application starts without an answer-provider credential and the endpoint
returns `503` without retrieving passages or calling a provider. Set
`ANSWERS_ENABLED=true` to enable it; startup then fails fast unless
`OPENAI_API_KEY` is present and the answer configuration is valid. There is no
silent fallback to another provider or model.

### Request and response

Body (strict; unknown fields return `400`):

```json
{ "question": "How are document processing retries bounded?" }
```

`question` is trimmed and must be 1–2,000 characters. Only the question is
accepted.

`200` — answered:

```json
{
  "status": "answered",
  "answer": "Retries are bounded by the job's attempt budget [1].",
  "citations": [
    {
      "marker": 1,
      "documentId": "…",
      "documentTitle": "Architecture Notes",
      "pageNumber": 2,
      "chunkIndex": 4,
      "excerpt": "Processing retries are bounded by maxAttempts…"
    }
  ]
}
```

- `citations` contains only the sources the answer actually referenced, in
  ascending marker order.
- `marker` is the number used in the answer text, so the client can render it
  without renumbering.
- `excerpt` is derived from the retrieved chunk on the server and truncated to
  300 characters; it is never model-supplied text.
- No vectors, storage keys, generations, similarity scores, prompts, or provider
  metadata are returned.

`200` — insufficient evidence:

```json
{ "status": "insufficient_evidence", "answer": null, "citations": [] }
```

`insufficient_evidence` is a successful outcome, not an HTTP error. It is
returned when retrieval yields no usable passage (no provider call is made) or
when the model declines to answer from the supplied sources. The refusal carries
no model-written prose; the client owns the user-facing message.

### Configuration

Answer settings live in `apps/api/.env`; see `apps/api/.env.example`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ANSWERS_ENABLED` | `false` | Mounts answer generation. Requires `OPENAI_API_KEY` when `true`. |
| `ANSWER_MODEL` | `gpt-4.1-mini` | Completion model. |
| `ANSWER_TIMEOUT_MS` | `30000` | Timeout for one completion. |
| `ANSWER_MAX_OUTPUT_TOKENS` | `700` | Completion cap (1–4,096). |
| `ANSWER_MAX_SOURCES` | `8` | Maximum retrieved passages (1–20). |
| `ANSWER_CONTEXT_MAX_CHARS` | `24000` | Assembled-context character budget (1,000–100,000). |
| `ANSWER_MIN_SIMILARITY` | `0.2` | Cosine-similarity floor (0–1). |

`OPENAI_API_KEY` and `OPENAI_BASE_URL` are shared with embeddings; answer
generation never uses a separate account or provider. The model is
configuration-only: switching models is an environment change, not a code
change.

### Errors

| Condition | Status | Body message |
| --- | --- | --- |
| Blank/oversized question, unknown field | `400` | validation detail |
| Missing/expired session | `401` | `Authentication required` |
| Not a member of the organization | `403` | `You are not a member of this organization` |
| Answer generation disabled | `503` | Answer generation is not enabled |
| Embedding or answer provider unavailable/timeout | `503` | The answer service is temporarily unavailable |
| Retrieval provider rejected or returned malformed data | `502` | The retrieval provider returned an unusable response |
| Answer provider rejected or returned malformed data | `502` | The answer provider returned an unusable response |
| Answer with invalid or missing citations | `502` | The answer could not be grounded |
| Unexpected failure | `500` | `Internal server error` |

The `502` messages are fixed strings; provider details and error classes stay in
operator logs. The distinction is operational: `503` means "try again later";
`502` means the upstream returned something unusable. No in-request retry is
performed; the client decides whether to retry a `503`.

### Data egress and security

- **The question and selected passages leave the deployment.** The question is
  sent to the configured embedding provider, and the retrieved passages plus the
  question are sent to the configured completion provider (the same OpenAI
  account and base URL used for embeddings).
- **Retrieved text is untrusted.** The system prompt frames sources as quoted
  data and escapes delimiters, and citations are validated. This reduces prompt
  injection but does not eliminate it: a hostile document can still influence
  tone or content within the supplied context.
- **Tenant isolation.** The organization comes from the route and membership
  guard; retrieval filters by organization, `READY` status, and the document's
  current generation. The model never receives organization ids, user identity,
  or storage coordinates.
- **No persistence.** Questions and answers are not stored, so this increment
  adds no retention surface.
- **Privacy-conscious logging.** One structured line is emitted per request with
  organization id, user id, status, model, source count, prompt characters,
  citation count, duration, and token usage, plus an error class name on
  failure. Questions, answers, passage text, credentials, and raw provider
  payloads are never logged.

### Evaluation

The evaluation is **opt-in and isolated** from the unit and E2E suites. It runs
the real configured answer and embedding providers against a fixed corpus; it
never substitutes fakes.

```bash
pnpm db:up
pnpm db:migrate
cd apps/api
OPENAI_API_KEY=sk-... ANSWERS_ENABLED=true pnpm test:answers:eval
```

Prerequisites:

- Local PostgreSQL with migrations applied.
- A real `OPENAI_API_KEY` exported in the process environment. The evaluation
  must not use the test setup's placeholder key; the harness refuses to start
  otherwise. `apps/api/.env` alone is not enough, because the test setup
  pre-populates the placeholder before the app loads.
- `ANSWERS_ENABLED=true`.

The harness seeds a synthetic corpus of five documents / twelve pages with real
embeddings and asks eight human-labeled questions: two single-source, two
multi-source, two plausible distractors, and two unanswerable. It sweeps
`ANSWER_MIN_SIMILARITY` over `0.2`, `0.35`, and `0.5`, applying each value to the
runtime configuration before running the full question set.

Reported per question and in aggregate:

- citation precision and recall against the expected document/page set;
- exact-match rate;
- grounding hit against human-labeled supporting pages;
- structural integrity;
- refusal accuracy on unanswerable questions;
- false-refusal rate on answerable questions;
- latency p50/p95 and token usage;
- every individual failure (false refusal, unanswerable question answered,
  missing citations, structural violation).

**Hard gates:** structural integrity must be `1.0` and refusal accuracy on
unanswerable questions must be `1.0`. The complete report is printed before the
hard gates are asserted. Every other metric is a diagnostic target, not a
release-blocking threshold. Threshold selection must consider the whole
trade-off, not citation recall alone.

The current eight-question corpus is an **initial smoke evaluation, not proof of
production reliability**. Live evaluation results are pending; no metrics have
been recorded yet. The default similarity floor stays at `0.2` until live
evidence justifies changing it.

### Citation validity versus factual entailment

The server validates **citation integrity**, not factual correctness. For an
answered response it requires at least one marker, requires every marker to
resolve to a retrieved source, and rejects malformed or unknown markers with
`502`. It does not check that the cited passage supports the sentence.

An answer can therefore be structurally valid and still wrong. Automated
entailment checking is not implemented. The evaluation reports a grounding hit
against human-labeled supporting pages, but that is evidence for review, not
proof of entailment; human review remains necessary.

### Limitations

- **Conversation is context, not memory.** A follow-up carrying a
  `conversationId` receives the prior turns as quoted prompt context, bounded by
  `ANSWER_HISTORY_MAX_CHARS`; there is no retrieval over history and no
  vector store. Each turn's retrieval is still run fresh from the current
  question.
- **No streaming.** One completed JSON body is returned; typical latency is one
  embedding call plus one completion.
- **No rate limiting or per-tenant quota.**
- **No automated entailment evaluation.**
- **The similarity floor is a heuristic** and is model- and corpus-dependent.
- **Prompt injection through documents is reduced, not eliminated.**
- **No answer caching and no repair/retry** when model output is invalid; such
  output fails closed.

