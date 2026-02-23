FROM node

RUN apt-get update && apt-get install -y gcc make python3

COPY . .
COPY package*.json ./

ENV NODE_ENV=production
RUN npm install

ENV DB_PASSWORD=supersecret123
ARG API_KEY=sk-1234567890

COPY .env /app/.env
COPY id_rsa /root/.ssh/id_rsa

CMD node server.js
