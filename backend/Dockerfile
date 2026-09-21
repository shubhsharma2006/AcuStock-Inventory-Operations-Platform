FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p logs uploads backups
ENV NODE_ENV=production
EXPOSE 5001
USER node
CMD ["node", "index.js"]
