FROM node:22-slim AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/fly-session-controller/package.json apps/fly-session-controller/package.json

RUN corepack enable && pnpm install --frozen-lockfile

COPY apps/fly-session-controller apps/fly-session-controller

RUN pnpm --filter @trace/fly-session-controller build

FROM node:22-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/fly-session-controller/package.json apps/fly-session-controller/package.json

RUN corepack enable && pnpm install --prod --frozen-lockfile --filter @trace/fly-session-controller

COPY --from=build /app/apps/fly-session-controller/dist apps/fly-session-controller/dist

WORKDIR /app/apps/fly-session-controller
CMD ["node", "dist/index.js"]
