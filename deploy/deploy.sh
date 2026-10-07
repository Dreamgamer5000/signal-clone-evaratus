#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Cloud identifiers live in deploy/.env (gitignored). Copy .env.example first.
if [ ! -f .env ]; then
  echo "ERROR: deploy/.env is missing. Run: cp deploy/.env.example deploy/.env and fill it in." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source ./.env
set +a

for var in GCP_PROJECT_ID GCP_REGION GCP_REPO_NAME GCP_VM_NAME GCP_ZONE; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is not set in deploy/.env" >&2
    exit 1
  fi
done

REPO="$GCP_REGION-docker.pkg.dev/$GCP_PROJECT_ID/$GCP_REPO_NAME"

cd ..

echo "==> Building images"
docker build -f deploy/Dockerfile.backend  -t "$REPO/signal-backend:latest"  .
docker build -f deploy/Dockerfile.frontend -t "$REPO/signal-frontend:latest" .

echo "==> Pushing to Artifact Registry"
docker push "$REPO/signal-backend:latest"
docker push "$REPO/signal-frontend:latest"

echo "==> Syncing compose file + env to VM"
gcloud compute scp deploy/docker-compose.yml deploy/.env "$GCP_VM_NAME:/home/dream/signal-clone/" \
  --zone "$GCP_ZONE" --project "$GCP_PROJECT_ID"

echo "==> Deploying on VM"
gcloud compute ssh "$GCP_VM_NAME" --zone "$GCP_ZONE" --project "$GCP_PROJECT_ID" --command "
  set -e
  cd /home/dream/signal-clone
  sudo docker compose pull
  sudo docker compose up -d
  sudo docker compose ps
"

echo "==> Done. Check https://signal.rejit.in"
