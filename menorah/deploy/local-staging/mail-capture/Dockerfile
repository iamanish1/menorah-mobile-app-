FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2

WORKDIR /app

COPY --chown=node:node server.mjs /app/server.mjs

ENV NODE_ENV=production \
    MAIL_CAPTURE_PORT=8025

USER node

EXPOSE 8025

CMD ["node", "/app/server.mjs"]
