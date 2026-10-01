# syntax=docker/dockerfile:1

# ---- 1. Build du client (React + Vite) ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY client ./client
RUN npm run build

# ---- 2. Image d'exécution (API Express + client statique) ----
FROM node:24-slim
ENV NODE_ENV=production \
    PORT=2508 \
    TZ=Europe/Paris
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY CATALOGUE_DONNEES_OUVERTES.md ./
COPY --from=build /app/client/dist ./client/dist

# Base SQLite et données importées : volume à monter sur /app/data
RUN mkdir -p /app/data && chown -R node:node /app
VOLUME ["/app/data"]
USER node

EXPOSE 2508
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:2508/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
