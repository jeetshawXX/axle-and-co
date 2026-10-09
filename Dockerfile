# --- build the React client and install server dependencies
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY client/package*.json client/
RUN npm --prefix client ci
COPY server/package*.json server/
RUN npm --prefix server ci --omit=dev
COPY client client
RUN npm --prefix client run build

# --- runtime image
FROM node:22-bookworm-slim
ENV NODE_ENV=production DB_FILE=/data/store.db PORT=5000
WORKDIR /app
COPY --from=build /app/server/node_modules server/node_modules
COPY server server
COPY --from=build /app/client/dist client/dist
VOLUME /data
EXPOSE 5000
CMD ["node", "server/src/index.js"]
