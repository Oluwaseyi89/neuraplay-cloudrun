#!/bin/bash
set -e

PORT=${PORT:-8000}
echo "Starting on port: $PORT"

python manage.py migrate --noinput

echo "Starting Daphne (HTTP + WebSocket)..."
exec daphne -b 0.0.0.0 -p "$PORT" neuraplay.asgi:application
