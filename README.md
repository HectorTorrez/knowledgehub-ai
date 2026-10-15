# KnowledgeHub AI

Multi-tenant RAG SaaS. A pnpm + Turborepo monorepo:

- `apps/api` — NestJS backend (owns all business logic and database access).
- `apps/web` — TanStack Start frontend (talks to the API over HTTP).
- `packages/*` — shared TypeScript, ESLint, and contract types.

## Prerequisites

- Node.js 24 (`nvm use`)
- pnpm 11 (`corepack enable` then `pnpm -v`)
- Docker with the Compose plugin (for the local PostgreSQL database)

## Setup

```bash
pnpm install

# Environment files (never committed).
cp .env.example .env                 # Postgres credentials for Docker Compose
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

Local development also enables browser (cookie) authentication via the example
`BROWSER_AUTH_ENABLED=true`, which requires a `CSRF_SECRET` of at least 32
characters — the example ships a placeholder, generate a unique one per
environment the same way. The API default is `BROWSER_AUTH_ENABLED=false` (see
the browser-auth gate below), so production stays bearer-only unless you opt in
with a real CSRF secret.

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

## Authentication

The `auth` module owns the full credential lifecycle:

```
POST /auth/register   { email, password, firstName, lastName }  -> 201 { user }
POST /auth/login      { email, password }                       -> 200 { user }
POST /auth/refresh                                              -> 200 { user }
POST /auth/logout                                               -> 204
```

- `register` returns `409` if the normalized email is already registered;
  `register`/`login` return `400` for invalid input and `401` for bad
  credentials. `login` uses the same generic `401` for an unknown email and a
  wrong password.
- Tokens are delivered as cookies, never in the body: a short-lived, `HttpOnly`
  `access_token` (JWT, default `15m`) and an `HttpOnly` `refresh_token` scoped to
  `/auth` (default `7` days). Passwords are hashed with Argon2id; refresh tokens
  are stored only as a SHA-256 hash.
- Configure lifetimes and cookie behavior via `JWT_ACCESS_TTL`
  (default `15m`), `REFRESH_TOKEN_TTL_DAYS` (default `7`), `COOKIE_SECURE`,
  `COOKIE_SAMESITE` and `COOKIE_DOMAIN` (see `apps/api/.env.example`).
- `refresh` rotates the refresh token: the presented token is consumed with a
  conditional update (single use) inside one transaction that also re-checks the
  session and creates its successor, then a new access token is signed. A
  replayed (already-used) token revokes the whole session. The successor's
  lifetime is clamped to the session's absolute expiry, so rotation never
  extends the session. Every rejected refresh is a generic `401`.
- `logout` revokes the session identified by the refresh cookie when browser
  authentication is enabled (only that device), clears the access, refresh and
  CSRF cookies on their original paths, and is idempotent. It does not need a
  valid access token, so it still works after the access token expires. While
  browser authentication is disabled it never revokes a session through the
  refresh cookie; it still clears the cookies and returns `204`.

**CSRF:** `HttpOnly` cookies stop token theft via XSS but do not prevent CSRF.
The API now ships the CSRF foundations:

- **Signed double-submit token.** When browser authentication is enabled,
  register/login/refresh set a JavaScript-readable `csrf_token`
  cookie whose value is `nonce.HMAC-SHA256(nonce)` signed with a dedicated
  `CSRF_SECRET`. Every unsafe cookie-authenticated request must echo that value
  in the `X-CSRF-Token` header; the API verifies the signature and compares the
  cookie and header with a timing-safe comparison.
- **Origin validation.** Unsafe cookie-authenticated requests must carry an
  `Origin` (or a `Referer` to fall back to) that matches the `CORS_ORIGIN`
  allow-list.
- **Bearer clients are unaffected.** A request carrying a valid, non-empty
  `Authorization: Bearer <token>` credential is not subject to the cookie CSRF
  rules. An empty or malformed bearer value (for example `Authorization: Bearer `)
  is *not* treated as bearer, so it cannot skip CSRF while cookie auth applies.

**Frontend responsibility:** read the `csrf_token` cookie (it is intentionally
not `HttpOnly`) and send its value in the `X-CSRF-Token` header on every unsafe
request (`POST`/`PUT`/`PATCH`/`DELETE`) that relies on cookie authentication.

**Browser-auth security gate:** browser (cookie) authentication is opt-in via
`BROWSER_AUTH_ENABLED` (schema/API default `false`; `apps/api/.env.example` sets
it to `true` for the local-development cookie flow) and requires a `CSRF_SECRET`
of at least 32 characters. Enabling browser auth without a secret fails startup,
so a production deployment cannot silently accept cookie-authenticated writes
without CSRF. When disabled, cookie tokens are rejected and only bearer tokens
are accepted, and cookie-based refresh is refused. `logout` is the one narrow
exception: a cookie-authenticated logout is still allowed *through the CSRF
guard* (it must present a trusted `Origin` and a valid `X-CSRF-Token`) so the
client can always clear its cookies, but it never revokes the session while
browser auth is off. This is still local-development-only until the remaining
auth flows and their security review are complete; do not treat the
implementation of this guard as production readiness.

## Development

```bash
pnpm dev        # starts the API (watch) and the web app together
```

`pnpm dev` only starts the applications; it never touches the database's
contents. Run `pnpm db:up` and `pnpm db:migrate` first.

Quality gates:

```bash
pnpm lint
pnpm check-types
pnpm test
pnpm build
```

The Prisma client is generated into `apps/api/src/generated/prisma` (git-ignored)
and is recreated automatically before `dev`, `build`, `check-types`, and `test`.
