FROM node:22-alpine
WORKDIR /app
COPY package.json start.js server.js ./
COPY lib ./lib
COPY public ./public
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "start.js"]
