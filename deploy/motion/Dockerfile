FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY Questera-Backend/package.json Questera-Backend/package-lock.json ./Questera-Backend/
RUN npm ci --prefix Questera-Backend
COPY . .
RUN node -e "require('@remotion/renderer').ensureBrowser({logLevel:'info'})"
ENV NODE_ENV=production
EXPOSE 4701
CMD ["npm","run","motion:api"]
