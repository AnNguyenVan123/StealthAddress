# Build stage
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json ./
RUN apk add --no-cache python3 make g++ git && npm install

COPY . .

# Pass build arguments to be available as environment variables during Vite build


RUN npm run build

# Serve stage using NGINX
FROM nginx:alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy static assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom NGINX config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Replace 8080 with the dynamic $PORT provided by Cloud Run, then start Nginx
CMD sed -i -e 's/listen 8080;/listen '"$PORT"';/g' /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'
