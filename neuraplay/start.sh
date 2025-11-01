#!/bin/bash
set -e

PORT=${PORT:-8080}
echo "Starting on port: $PORT"

python manage.py migrate --noinput

if [ "$PROCESS_TYPE" = "worker" ]; then
    echo "Starting Celery Worker..."
    exec celery -A neuraplay worker --loglevel=info
elif [ "$PROCESS_TYPE" = "beat" ]; then
    echo "Starting Celery Beat..."
    exec celery -A neuraplay beat --loglevel=info
else
    echo "Starting Django Server with WebSocket and Celery Worker..."
    
    # Start Celery worker in background
    echo "Starting Celery Worker in background..."
    celery -A neuraplay worker --loglevel=info --concurrency=1 &
    
    # Start Daphne for WebSocket support (this keeps container alive)
    echo "Starting Daphne WebSocket server..."
    exec daphne -b 0.0.0.0 -p $PORT neuraplay.asgi:application
fi