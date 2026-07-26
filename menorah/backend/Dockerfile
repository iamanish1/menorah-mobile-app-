# ── Stage 1: install production deps ──────────────────────────────────────
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS deps

WORKDIR /app

COPY package.json package-lock.json ./
# ci = clean install, exact versions, no dev deps
RUN npm ci --omit=dev

# ── Stage 2: final runtime image ───────────────────────────────────────────
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS runner

# Fonts are required by Sharp/libvips when rendering SVG text for Social Studio
# Instagram images. Without them, production renders letters as square glyphs.
RUN apk add --no-cache fontconfig ttf-dejavu ttf-liberation && fc-cache -f

# Build tooling is not needed at runtime and carries an avoidable dependency tree.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn* \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Security: run as non-root user
RUN addgroup -S menorah && adduser -S menorah -G menorah

WORKDIR /app

# Copy only production deps from previous stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY src/ ./src/

# PM2 is not used inside Docker — Cloud Run / docker-compose scale via replicas.
# Each container runs a single Node process; the orchestrator handles clustering.
COPY package.json ./

# Create writable runtime dirs with correct ownership
RUN mkdir -p logs uploads && chown -R menorah:menorah /app

USER menorah

# Cloud Run expects PORT env var — default 8080, overridden to 3000 on VPS
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Healthcheck — Cloudflare and Cloud Run use this to decide if container is live
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/services/api-web/server.js"]
