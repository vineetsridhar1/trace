FROM node:24.14.0-slim AS base
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.7.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/gql/package.json packages/gql/
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm rebuild @prisma/client @prisma/engines prisma esbuild

FROM deps AS build
COPY packages/gql/ packages/gql/
COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/
COPY apps/web/ apps/web/
COPY tsconfig.base.json ./
RUN cd apps/server && npx prisma generate
RUN node packages/gql/scripts/codegen.cjs
RUN pnpm --filter @trace/shared build
RUN pnpm --filter @trace/gql build
RUN pnpm --filter @trace/server build
ARG VITE_API_URL=""
ARG VITE_AG_GRID_LICENSE_KEY=""
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_AG_GRID_LICENSE_KEY=${VITE_AG_GRID_LICENSE_KEY}
RUN pnpm --filter @trace/web build

FROM base AS production
RUN npm install -g serve@14
RUN groupadd --gid 1001 trace && \
    useradd --uid 1001 --gid trace --create-home trace
WORKDIR /app

COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/gql/package.json packages/gql/
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/web/package.json apps/web/

COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/packages/gql/node_modules/ packages/gql/node_modules/
COPY --from=build /app/packages/shared/node_modules/ packages/shared/node_modules/
COPY --from=build /app/apps/server/node_modules/ apps/server/node_modules/
COPY --from=build /app/apps/web/node_modules/ apps/web/node_modules/

COPY --from=build /app/packages/gql/dist/ packages/gql/dist/
COPY --from=build /app/packages/gql/src/schema.graphql packages/gql/src/schema.graphql
COPY --from=build /app/packages/shared/dist/ packages/shared/dist/
COPY --from=build /app/apps/server/dist/ apps/server/dist/
COPY --from=build /app/apps/server/prisma/ apps/server/prisma/
COPY --from=build /app/apps/web/dist/ apps/web/dist/

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
RUN chown -R trace:trace /app

USER trace
ENV NODE_ENV=production
EXPOSE 3000 4000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
