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

Registration lives under the `auth` module:

```
POST /auth/register
{ "email": "ada@example.com", "password": "…", "firstName": "Ada", "lastName": "Lovelace" }
```

- Returns `201` with the public user profile. `400` for invalid input, `409` if
  the normalized email is already registered.
- Tokens are delivered as cookies, never in the body: a short-lived, `HttpOnly`
  `access_token` (JWT, default `15m`) and an `HttpOnly` `refresh_token` scoped to
  `/auth` (default `7` days). Passwords are hashed with Argon2id; refresh tokens
  are stored only as a SHA-256 hash.
- Configure lifetimes and cookie behavior via `JWT_ACCESS_TTL`
  (default `15m`), `REFRESH_TOKEN_TTL_DAYS` (default `7`), `COOKIE_SECURE`,
  `COOKIE_SAMESITE` and `COOKIE_DOMAIN` (see `apps/api/.env.example`).
- The lifecycle is not complete yet: after the access token expires there is no
  refresh endpoint to renew it, so a client currently has to register (or, later,
  log in) again. Refresh is the next phase.

**CSRF:** `HttpOnly` cookies stop token theft via XSS but do not prevent CSRF.
Local development relies on `SameSite=Lax` plus the API's explicit CORS
allow-list. Before this is exposed beyond local development, add a CSRF token
(double-submit) and/or strict `Origin`/`Referer` validation for state-changing
requests. Refresh-token rotation and reuse detection are designed into the
schema but not yet implemented, so there is intentionally no refresh endpoint.

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
