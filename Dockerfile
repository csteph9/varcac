# Root-level Dockerfile
FROM node:22-alpine

WORKDIR /app/server

RUN apk add --no-cache mariadb-client

# Install deps first (use cache)
COPY server/package*.json ./
RUN npm ci --omit=dev

# Copy server source (index.js, db.js, public/, etc.)
# Do NOT copy .env; provide it at runtime
COPY server/ ./

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "index.js"]
