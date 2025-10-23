# ---- Base image ----
    ARG NODE_VERSION=20.19.2
    FROM node:${NODE_VERSION}-alpine
    
    # ---- Environment ----
    ENV PUPPETEER_SKIP_DOWNLOAD=true \
        PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
        PNPM_HOME="/usr/local/share/pnpm" \
        PATH="$PNPM_HOME:$PATH"
    
    # ---- Install system deps ----
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
        libavif \
        curl \
        bash
    
    # ---- Install pnpm ----
    RUN corepack enable && corepack prepare pnpm@latest --activate
    
    # ---- Working directory ----
    WORKDIR /app
    
    # ---- Copy dependency files ----
    COPY package.json pnpm-lock.yaml* ./
    
    # ---- Install dependencies (prod only) ----
    RUN pnpm install --frozen-lockfile --prod
    
    # ---- Copy application ----
    COPY . .
    
    # ---- Entrypoint ----
    RUN chmod +x /app/entrypoint.sh
    
    CMD ["/app/entrypoint.sh"]
    