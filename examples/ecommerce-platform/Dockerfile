# Multi-stage production Dockerfile for high-performance NodeJS backend microservices.
# Uses alpine base, runs as non-root compliance user node, and sets up healthchecks.

# Phase 1: Build dependencies
FROM node:20.12.0-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build --if-present

# Phase 2: Production release runtime environment
FROM node:20.12.0-alpine AS runner

ENV NODE_ENV=production
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package.json ./package.json

EXPOSE 8080

# Enforce secure security profiles running container as non-root user
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "dist/index.js"]
