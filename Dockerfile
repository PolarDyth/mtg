# syntax=docker/dockerfile:1
ARG NODE_VERSION=22
# Digest pin (index digest of node:22-alpine) for reproducible base-image
# builds — bump via dependabot or `docker buildx imagetools inspect node:22-alpine`.
ARG NODE_DIGEST=sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

# --- deps: all deps (dev deps are needed for next build + typecheck) ---
FROM node:${NODE_VERSION}-alpine@${NODE_DIGEST} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci

# --- build: next build + server tsc --noEmit (typecheck gate) ---
FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY shared/ shared/
COPY frontend/ frontend/
COPY server/ server/
# cache/ is only useful for incremental rebuilds; drop it from the image
RUN npm run build && rm -rf frontend/.next/cache

# --- prod-deps: runtime-only node_modules (tsx/next/ws are prod deps) ---
FROM node:${NODE_VERSION}-alpine@${NODE_DIGEST} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci --omit=dev

# --- runtime: same command as `npm start`; shared/ is raw TS, keep layout ---
FROM node:${NODE_VERSION}-alpine@${NODE_DIGEST} AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node shared/ shared/
COPY --chown=node:node server/ server/
COPY --chown=node:node frontend/ frontend/
COPY --from=build --chown=node:node /app/frontend/.next frontend/.next
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider "http://127.0.0.1:${PORT}/" || exit 1
CMD ["node", "--import", "tsx", "server/src/index.ts"]
