# syntax=docker/dockerfile:1
# Saans: one image that builds the app and serves it (static site + /api/assistant) on port 8080.
#   docker compose up --build        (reads settings from .env)

# ---- Build stage: install, build the client and the server bundle ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm run build:server

# ---- Runtime stage: no node_modules needed, the server bundle uses only Node built-ins ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server/index.js ./server.js
COPY --from=build --chown=node:node /app/vercel.json ./vercel.json
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "server.js"]
