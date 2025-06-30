FROM node:22.16.0-alpine

WORKDIR /app

RUN apk add --no-cache wget

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./
COPY nx.json tsconfig.base.json ./

RUN pnpm install --frozen-lockfile

COPY apps/dmr-server ./apps/dmr-server
COPY libs ./libs

RUN pnpm run build:server

EXPOSE 5000

CMD ["node", "dist/apps/dmr-server/main.js"]
