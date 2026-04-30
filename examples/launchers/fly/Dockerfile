FROM node:22-slim AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml tsconfig.json ./

RUN corepack enable && pnpm install --frozen-lockfile

COPY src src

RUN pnpm build

FROM node:22-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN corepack enable && pnpm install --prod --frozen-lockfile

COPY --from=build /app/dist dist

CMD ["node", "dist/index.js"]
