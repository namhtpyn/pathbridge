FROM oven/bun:1.4.2 AS build
ARG APP_VERSION=dev
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:latest AS runtime
ARG APP_VERSION=dev
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data APP_VERSION=${APP_VERSION}
COPY --from=build /app/.output ./.output
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts ./scripts
RUN mkdir -p /data
EXPOSE 3000
# readiness probe: the runtime image ships no curl/wget — probe with bun's
# fetch against /health/ready (liveness + DB reachable). ~2s grace at boot.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["bun", "-e", "const t=setTimeout(()=>process.exit(1),4500); const r=await fetch('http://127.0.0.1:3000/health/ready'); clearTimeout(t); process.exit(r.ok?0:1)"]
CMD ["bun", ".output/server/index.mjs"]
