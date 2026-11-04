# syntax=docker/dockerfile:1.7
FROM node:24.22.1-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/config/package.json packages/config/package.json
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm db:generate && pnpm build

# Local/demo runtime; API deliberately refuses production/mock release.
# Tools/migrations are included so the same reviewed image runs the migration job.
FROM node:24.22.1-bookworm-slim AS runtime
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/.local/media /app/.local/sms && chown -R node:node /app/.local && chmod 0700 /app/.local/sms
USER node
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
