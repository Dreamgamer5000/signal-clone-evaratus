#!/usr/bin/env bash
set -euo pipefail

PROJECT=GCP_PROJECT_ID
REGION=GCP_REGION
REPO=$REGION-docker.pkg.dev/$PROJECT/GCP_REPO_NAME
VM=GCP_VM_NAME
ZONE=GCP_ZONE
VM_DIR=/home/dream/signal-clone

cd "$(dirname "$0")/.."

echo "==> Building images"
docker build -f deploy/Dockerfile.backend  -t $REPO/signal-backend:latest  .
docker build -f deploy/Dockerfile.frontend -t $REPO/signal-frontend:latest .

echo "==> Pushing to Artifact Registry"
docker push $REPO/signal-backend:latest
docker push $REPO/signal-frontend:latest

echo "==> Syncing compose file to VM"
gcloud compute scp deploy/docker-compose.yml "$VM:$VM_DIR/docker-compose.yml" --zone $ZONE --project $PROJECT

echo "==> Deploying on VM"
gcloud compute ssh $VM --zone $ZONE --project $PROJECT --command "
  set -e
  cd $VM_DIR
  sudo docker compose pull
  sudo docker compose up -d
  sudo docker compose ps
"

echo "==> Done. Check https://signal.rejit.in"
