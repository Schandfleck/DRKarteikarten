# ---------- 1. Weboberflächen bauen ----------
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY apps/betreuer/package.json apps/betreuer/
COPY apps/kinder/package.json apps/kinder/
RUN npm ci
COPY assets assets
COPY tools tools
COPY apps apps
RUN npm run build

# ---------- 2. Server-Abhängigkeiten (nur Laufzeit, ohne Entwicklungswerkzeuge) ----------
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci --omit=dev --ignore-scripts --workspace server

# ---------- 3. Schlankes Laufzeit-Image: nur Alpine + die Node-Binärdatei, ohne npm/yarn/corepack ----------
FROM alpine:3.24
RUN apk add --no-cache libstdc++ libatomic \
 && addgroup -g 1000 node && adduser -u 1000 -G node -s /bin/sh -D node
COPY --from=build /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000
WORKDIR /app
COPY package.json ./
COPY server/package.json server/
COPY --from=deps /app/node_modules node_modules
COPY server/src server/src
COPY --from=build /app/apps/betreuer/dist apps/betreuer/dist
COPY --from=build /app/apps/kinder/dist apps/kinder/dist

# Daten (Datenbank + Bilder) liegen im Volume /data; der Server läuft nicht als root
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server/src/index.ts"]
