FROM node:24.12.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
WORKDIR /app
FROM base AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/application/package.json packages/application/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile
FROM dependencies AS build
COPY . .
RUN pnpm build
FROM dependencies AS production-dependencies
RUN pnpm --config.confirmModulesPurge=false install --prod --frozen-lockfile
FROM node:24.12.0-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATABASE_URL=file:/data/finance.db
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/database/migrations ./packages/database/migrations
COPY package.json ./package.json
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8080/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/apps/api/src/main.js"]
