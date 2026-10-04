#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed. See https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Error: docker is not running. Start Docker and try again."
  exit 1
fi

if [ ! -f .env ]; then
  echo "Error: .env not found. Copy .env.example to .env and set OPENROUTER_API_KEY."
  exit 1
fi

echo "Starting Kanban Studio..."
docker compose up --build -d

echo ""
echo "Kanban Studio is running at http://localhost:8000"
