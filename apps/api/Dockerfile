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
RUN --mount=type=cache,id=s/b5775291-ea1b-492c-98ae-ec26a4e84a68-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline --store-dir /pnpm/store \
      --filter @knowledgehub/api...
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @knowledgehub/api... build
RUN --mount=type=cache,id=s/b5775291-ea1b-492c-98ae-ec26a4e84a68-pnpm-store,target=/pnpm/store \
    pnpm --filter @knowledgehub/api deploy --prod --legacy --store-dir /pnpm/store /out

FROM node:24.22.1-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out apps/api
COPY --from=build /app/apps/api/dist apps/api/dist
CMD ["sh", "-c", "cd apps/api && exec node --max-old-space-size=384 dist/main.js"]
