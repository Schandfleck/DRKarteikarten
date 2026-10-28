# ---------- 1. Weboberflächen bauen ----------
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY apps/betreuer/package.json apps/betreuer/
COPY apps/kinder/package.json apps/kinder/
RUN npm ci
COPY apps apps
RUN npm run build

# ---------- 2. Schlankes Laufzeit-Image ----------
FROM node:26-alpine
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server && npm cache clean --force
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
