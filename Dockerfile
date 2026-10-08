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
CMD ["bun", ".output/server/index.mjs"]
