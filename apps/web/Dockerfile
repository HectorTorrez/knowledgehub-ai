# syntax=docker/dockerfile:1.7

FROM node:24.22.1-slim AS base
RUN npm install --global pnpm@11.23.0
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .nvmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/tsconfig/package.json packages/tsconfig/
# Railway only honors cache mounts whose id is prefixed with "s/<service id>".
RUN --mount=type=cache,id=s/9d13cb79-aa1c-46b0-b15d-a0ec7247bc46-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline --store-dir /pnpm/store \
      --filter @knowledgehub/web...
COPY packages packages
COPY apps/web apps/web
ARG VITE_API_BASE_URL
ARG VITE_SITE_URL
ARG VITE_DEMO_ENABLED
ARG VITE_DISABLE_DEVTOOLS
ARG VITE_SENTRY_DSN
RUN pnpm --filter @knowledgehub/web... build

FROM node:24.22.1-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/web/.output apps/web/.output
CMD ["node", "--max-old-space-size=192", "apps/web/.output/server/index.mjs"]
