#!/usr/bin/env bash
# ORM CMS Platform — one-command startup (Linux/Mac)
set -e
cd "$(dirname "$0")"

[ -f .env ] || { echo "Creating .env from .env.example"; cp .env.example .env; }

echo "[1/5] Starting infrastructure ..."
docker compose up -d postgres redis opensearch minio

echo "[2/5] Waiting for Postgres ..."
until docker compose exec -T postgres pg_isready -U orm_user -d orm_db >/dev/null 2>&1; do
  sleep 3
done

echo "[3/5] Running migrations ..."
docker compose run --rm backend alembic upgrade head

echo "[4/5] Seeding demo data ..."
docker compose run --rm backend python -m scripts.seed

echo "[5/5] Starting app services ..."
docker compose up -d backend worker worker-beat frontend nginx

cat <<EOF

============================================
 ORM CMS is starting up.
 App:        http://localhost:8080
 API docs:   http://localhost:8080/api/v1/docs
 Health:     http://localhost:8080/api/v1/health
 Login:      admin@orm.local / Admin@123
============================================
EOF
