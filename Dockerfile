ARG NODE_VERSION=20.19.2

FROM node:${NODE_VERSION}-alpine

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

RUN apk add --no-cache \
    chromium \
    nss \
    ca-certificates \
    freetype \
    harfbuzz \
    ttf-freefont \
    libgcc \
    libstdc++ \
    libx11 \
    libxcomposite \
    libxdamage \
    libxrandr \
    libxfixes \
    libxext \
    libxrender \
    libxcb \
    libxtst \
    libjpeg-turbo \
    libwebp \
    libpng \
    libavif

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN chmod +x /app/entrypoint.sh

CMD ["/app/entrypoint.sh"]
