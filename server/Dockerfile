FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY server/package.json ./server/package.json
COPY server/index.mjs ./server/index.mjs
COPY server/import.mjs ./server/import.mjs
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV PORT=4100 DATA_DIR=/app/data
EXPOSE 4100
CMD ["node", "server/index.mjs"]
