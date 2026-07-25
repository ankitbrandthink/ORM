@echo off
REM ORM CMS Platform — one-command startup (Windows)
setlocal

cd /d %~dp0

if not exist .env (
  echo Creating .env from .env.example ...
  copy .env.example .env >nul
)

echo [1/5] Starting infrastructure (postgres, redis, opensearch, minio) ...
docker compose up -d postgres redis opensearch minio

echo [2/5] Waiting for Postgres to be healthy ...
:waitpg
docker compose exec -T postgres pg_isready -U orm_user -d orm_db >nul 2>&1
if errorlevel 1 (
  timeout /t 3 >nul
  goto waitpg
)

echo [3/5] Running database migrations ...
docker compose run --rm backend alembic upgrade head

echo [4/5] Seeding demo data ...
docker compose run --rm backend python -m scripts.seed

echo [5/5] Starting application services ...
docker compose up -d backend worker worker-beat frontend nginx

echo.
echo ============================================
echo  ORM CMS is starting up.
echo  App:        http://localhost:8080
echo  API docs:   http://localhost:8080/api/v1/docs
echo  Health:     http://localhost:8080/api/v1/health
echo  MinIO:      http://localhost:9001  (minioadmin/minioadmin)
echo  Login:      admin@orm.local / Admin@123
echo ============================================
endlocal
