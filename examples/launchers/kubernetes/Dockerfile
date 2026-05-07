FROM node:22.14.0-slim AS base
RUN corepack enable && corepack prepare pnpm@10.7.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json vitest.config.ts ./
COPY src/ src/
RUN pnpm build

FROM node:22.14.0-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules/ node_modules/
COPY --from=deps /app/package.json package.json
COPY --from=build /app/dist/ dist/
USER node
EXPOSE 8787
CMD ["node", "dist/index.js"]
