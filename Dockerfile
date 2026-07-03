# ── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Upgrade npm to pick up patched bundled deps (picomatch, sigstore)
RUN npm install -g npm@latest

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

# Upgrade npm to pick up patched bundled deps (picomatch, sigstore)
RUN npm install -g npm@latest

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY server/ ./server/

# Runtime defaults (overridable via env_file / -e flags)
ENV NODE_ENV=production
ENV PORT=3000
ENV TRANSACTIONS_PATH=/app/data/transactions
ENV APP_TITLE="Financial Insights"

# Non-root user (security best practice; node user ships with node:alpine)
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server/index.js"]
