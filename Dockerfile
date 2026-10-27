FROM node:20-bullseye-slim

WORKDIR /app

# Install build dependencies for native WebRTC / mediasoup worker
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 8080 4443
ENV PORT=4443
ENV HTTP_PORT=8080
ENV TUNNEL=false

CMD ["npm", "start"]
