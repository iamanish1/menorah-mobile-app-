FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2

WORKDIR /app

COPY --chown=node:node server.js ./server.js

USER node

ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health/live').then((response) => process.exit(response.status === 200 ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
