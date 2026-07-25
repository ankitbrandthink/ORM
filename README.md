# ORM CMS Platform

Production-grade CRO / ORM social-listening & reputation-management platform.

## Stack
- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind, Framer Motion, Recharts
- **Backend:** FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, Celery, Redis
- **DB:** PostgreSQL 15 · **Search:** OpenSearch 2.11 · **Storage:** MinIO
- **AI:** Ollama (llama3 / qwen / mistral / deepseek) with heuristic fallback when offline
- **Infra:** Docker Compose + Nginx reverse proxy

## Quick start (Windows)
```bat
cd D:\ORM
copy .env.example .env
start.bat
```
Linux/Mac: `./start.sh`

Then open **http://localhost:8080** and log in with `admin@orm.local` / `Admin@123`.

## Manual startup sequence
```bash
docker compose up -d postgres redis opensearch minio
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend python -m scripts.seed
docker compose up -d backend worker worker-beat frontend nginx
```

## Services
| Service | URL |
|---|---|
| App (via nginx) | http://localhost:8080 |
| API docs (Swagger) | http://localhost:8080/api/v1/docs |
| Health | http://localhost:8080/api/v1/health |
| Health (deep) | http://localhost:8080/api/v1/health/services |
| MinIO console | http://localhost:9001 |
| OpenSearch | http://localhost:9200 |

## AI / Ollama
The pipeline calls a local Ollama server at `OLLAMA_BASE_URL` (default `host.docker.internal:11434`).
When Ollama is unavailable, deterministic heuristic analyzers (Hinglish-aware) produce
structured sentiment / emotion / crisis output so the platform is fully functional offline.
To enable real LLMs, uncomment the `ollama` service in `docker-compose.yml` and `ollama pull llama3`.

## Project layout
```
backend/    FastAPI app, models, API, AI, scrapers, search, workers, alembic, seed
frontend/   Next.js 15 app (dashboard, listening, ORM queue, analytics, reports, admin)
infra/      nginx config, opensearch
scripts/    helper scripts
```

## Phasing
- **Phase 1 (built):** auth + RBAC, multi-tenant schema, mock+RSS+NewsAPI ingestion,
  AI analysis pipeline, ticketing state machine, analytics, reports (PDF), dashboards.
- **Phase 2 (`PHASE-2-TODO`):** social platform adapters (FB/IG/YT/X), Playwright scrapers,
  bot/influencer detection, geo analysis, alert rules UI, MFA.
- **Phase 3 (`PHASE-3-TODO`):** Kubernetes, multi-region, WebSocket streaming, Sankey, white-label.
```
