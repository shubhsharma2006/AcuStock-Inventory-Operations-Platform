FROM node:20-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Ensure runtime directories exist with appropriate node user ownership
RUN mkdir -p logs uploads backups && chown -R node:node /app

ENV NODE_ENV=production
EXPOSE 5001

USER node

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5001/api/health || exit 1

CMD ["node", "index.js"]
