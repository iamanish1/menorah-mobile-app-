FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2

WORKDIR /app

COPY --chown=node:node server.mjs control.mjs /app/

ENV NODE_ENV=production \
    ALERT_FIXTURE_PORT=9101 \
    COMPOSE_PROJECT_NAME=menorah-local-staging \
    MENORAH_LOCAL_STAGING_ENVIRONMENT_ID=menorah-local-staging-v1

USER node

EXPOSE 9101

CMD ["node", "/app/server.mjs"]
