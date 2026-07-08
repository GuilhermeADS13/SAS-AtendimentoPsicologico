# ── Build ─────────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable

# Instala dependências (cacheável enquanto os manifests não mudam).
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# Variáveis VITE_* são embutidas no bundle do frontend em build time.
ARG VITE_APP_ID
ARG VITE_MIROTALK_URL=https://localhost:3010
ENV VITE_APP_ID=$VITE_APP_ID
ENV VITE_MIROTALK_URL=$VITE_MIROTALK_URL

COPY . .
RUN pnpm build

# ── Runtime ─────────────────────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Reaproveita node_modules do builder (o server é bundlado com --packages=external
# e resolve os pacotes em runtime).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# Usuário não-root (reduz superfície de ataque).
RUN useradd -m appuser && chown -R appuser /app
USER appuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
