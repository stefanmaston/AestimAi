# AestimAi Backend — Node.js
FROM node:20-alpine

WORKDIR /app

# Installera beroenden
COPY package*.json ./
RUN npm ci --omit=dev

# Kopiera serverkod (ej frontend-filer)
COPY news-proxy.js        ./
COPY uci-server.js        ./
COPY uci-index-updater.js ./
COPY blockchain/          ./blockchain/

# Kör som icke-root
RUN addgroup -S aestimai && adduser -S aestimai -G aestimai
USER aestimai

# Port exponeras av docker-compose per service
EXPOSE 3002 3004
