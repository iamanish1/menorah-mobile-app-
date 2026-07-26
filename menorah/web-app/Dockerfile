FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_JITSI_DOMAIN
ARG NEXT_PUBLIC_CALLS_URL
ARG MENORAH_LOCAL_STAGING_ENVIRONMENT_ID
ARG MENORAH_LOCAL_STAGING_HTTPS_PORT
ARG MENORAH_SERVER_STAGING_ENVIRONMENT_ID
ARG MENORAH_SERVER_STAGING_PROJECT_NAME
ARG MENORAH_SERVER_STAGING_HTTPS_PORT

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL \
    NEXT_PUBLIC_JITSI_DOMAIN=$NEXT_PUBLIC_JITSI_DOMAIN \
    NEXT_PUBLIC_CALLS_URL=$NEXT_PUBLIC_CALLS_URL \
    MENORAH_LOCAL_STAGING_ENVIRONMENT_ID=$MENORAH_LOCAL_STAGING_ENVIRONMENT_ID \
    MENORAH_LOCAL_STAGING_HTTPS_PORT=$MENORAH_LOCAL_STAGING_HTTPS_PORT \
    MENORAH_SERVER_STAGING_ENVIRONMENT_ID=$MENORAH_SERVER_STAGING_ENVIRONMENT_ID \
    MENORAH_SERVER_STAGING_PROJECT_NAME=$MENORAH_SERVER_STAGING_PROJECT_NAME \
    MENORAH_SERVER_STAGING_HTTPS_PORT=$MENORAH_SERVER_STAGING_HTTPS_PORT

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3001

RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn* \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY --from=builder --chown=nextjs:nextjs /app/.next ./.next
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/next.config.ts ./next.config.ts

USER nextjs

EXPOSE 3001

CMD ["sh", "-c", "node node_modules/next/dist/bin/next start -H 0.0.0.0 -p ${PORT:-3001}"]
