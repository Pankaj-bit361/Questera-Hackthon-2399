# Velos Studio worker: one job per container (capture → script → check → render), files in S3.
# Build from the repo root:  docker build --platform linux/amd64 -f deploy/studio/Dockerfile -t velos-studio-worker .
FROM node:22-bookworm-slim

# ffmpeg for audio mastering and thumbnails; the libraries Chrome Headless Shell needs; fonts so sites that use system
# fonts (system-ui, Helvetica, Arial, emoji) still look right on Linux.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates fontconfig \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
      libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 \
      fonts-inter fonts-liberation2 fonts-noto-core fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*
COPY deploy/studio/fonts.conf /etc/fonts/local.conf

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY Questera-Backend/package.json Questera-Backend/package-lock.json ./Questera-Backend/
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix Questera-Backend
RUN node -e "require('@remotion/renderer').ensureBrowser({logLevel:'info'})"

COPY studio ./studio
COPY Questera-Backend/motion/provider.cjs ./Questera-Backend/motion/provider.cjs
COPY Questera-Backend/studio ./Questera-Backend/studio
RUN node Questera-Backend/studio/render.cjs --bundle /app/.studio-bundle

ENV NODE_ENV=production STUDIO_BUNDLE_DIR=/app/.studio-bundle
USER node
CMD ["node", "Questera-Backend/studio/worker.cjs"]
