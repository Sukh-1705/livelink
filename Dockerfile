FROM node:20-bullseye-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 8080 4443
ENV PORT=8080
ENV HTTP_PORT=8080
ENV TUNNEL=false

CMD ["npm", "start"]
