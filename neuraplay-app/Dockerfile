# Stage 1 - Build
FROM node:22 AS build
WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2 - Serve with NGINX
FROM nginx:alpine

# Install gettext for envsubst
RUN apk add --no-cache gettext

# Copy build output
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config template
COPY nginx.conf.template /etc/nginx/nginx.conf.template

# Copy and make the startup script executable
COPY start-nginx.sh /start-nginx.sh
RUN chmod +x /start-nginx.sh

# Expose the port
EXPOSE 8080

# Use the startup script
CMD ["/start-nginx.sh"]