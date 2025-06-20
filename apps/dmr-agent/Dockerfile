FROM node:22.16.0-alpine

WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./
COPY nx.json tsconfig.base.json ./

RUN pnpm install --frozen-lockfile

COPY apps/dmr-agent ./apps/dmr-agent
COPY libs ./libs

RUN pnpm run build:agent

EXPOSE 5001

CMD ["node", "dist/apps/dmr-agent/main.js"]
