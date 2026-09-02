FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_VEILAP_PREVIEW_MODE=0
ARG NEXT_PUBLIC_STARKNET_CHAIN_ID=SN_MAIN
ARG NEXT_PUBLIC_STRK20_POOL_ADDRESS=0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
ENV NEXT_PUBLIC_STARKNET_CHAIN_ID=$NEXT_PUBLIC_STARKNET_CHAIN_ID
ENV NEXT_PUBLIC_STRK20_POOL_ADDRESS=$NEXT_PUBLIC_STRK20_POOL_ADDRESS
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/arena-worker.mjs ./scripts/arena-worker.mjs

EXPOSE 3000
CMD ["node", "server.js"]
