#!/bin/bash

set -e

echo "🚀 Starting NeuraPlay Production Deployment..."

REDIS_IP=$(gcloud redis instances describe neuraplay-redis --region=us-central1 --format="value(host)")
echo "🔗 Redis IP: $REDIS_IP"

echo "🌐 Deploying Web Service..."
gcloud run deploy neuraplay-service \
  --source . \
  --region us-central1 \
  --set-env-vars="PROCESS_TYPE=web,REDIS_URL=redis://$REDIS_IP:6379/0,PRODUCTION=true" \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=1Gi \
  --min-instances=1

echo "🔧 Deploying Worker Service..."
gcloud run deploy neuraplay-worker \
  --source . \
  --region us-central1 \
  --set-env-vars="PROCESS_TYPE=worker,REDIS_URL=redis://$REDIS_IP:6379/0,PRODUCTION=true" \
  --allow-unauthenticated \
  --cpu=1 \
  --memory=512Mi \
  --max-instances=1

echo "⏰ Deploying Beat Service..."
gcloud run deploy neuraplay-beat \
  --source . \
  --region us-central1 \
  --set-env-vars="PROCESS_TYPE=beat,REDIS_URL=redis://$REDIS_IP:6379/0,PRODUCTION=true" \
  --allow-unauthenticated \
  --cpu=0.5 \
  --memory=256Mi \
  --max-instances=1

echo "✅ Deployment complete!"
echo "🌐 Web URL: https://neuraplay-service-930102180917.us-central1.run.app"