FROM node:22.16.0-alpine

WORKDIR /app

RUN corepack enable pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY nx.json tsconfig.base.json ./

# Copy project files
COPY apps/tests/external-b ./apps/tests/external-b
COPY libs ./libs

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the application
RUN pnpm nx build external-b

EXPOSE 8074

CMD ["node", "dist/apps/tests/external-b/main.js"] 