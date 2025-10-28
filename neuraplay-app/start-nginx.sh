#!/bin/sh

# Set default port if PORT is not set
export PORT=${PORT:-8080}

# Use envsubst to replace environment variables in the template
envsubst '\$PORT' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Start nginx
exec nginx -g 'daemon off;'