FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM oven/bun:latest AS runtime
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data
COPY --from=build /app/.output ./.output
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts ./scripts
RUN mkdir -p /data
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
