from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_ENV: str = "development"
    APP_SECRET_KEY: str = "change-me"
    APP_ALLOWED_ORIGINS: str = "http://localhost,http://localhost:3000"

    # Database
    DATABASE_URL: str = "postgresql+psycopg://orm_user:orm_pass@postgres:5432/orm_db"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # OpenSearch
    OPENSEARCH_HOST: str = "http://opensearch:9200"

    # MinIO
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "orm-files"

    # JWT
    JWT_SECRET: str = "change-me-32-chars-minimum-secret-key"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_EXPIRE_MINUTES: int = 480  # 8 hours
    JWT_REFRESH_EXPIRE_DAYS: int = 7

    # Ollama (legacy — kept for fallback if Anthropic key not set)
    OLLAMA_BASE_URL: str = "http://host.docker.internal:11434"
    OLLAMA_DEFAULT_MODEL: str = "llama3"
    OLLAMA_FALLBACK_MODEL: str = "mistral"

    # Anthropic Claude API — primary sentiment engine
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_SENTIMENT_MODEL: str = "claude-haiku-4-5-20251001"
    # Per-tenant daily token ceiling (0 = unlimited)
    CLAUDE_DAILY_TOKEN_LIMIT: int = 500_000

    # Frontend base URL — used for password-reset links in emails
    FRONTEND_URL: str = "http://localhost:3001"

    # SMTP — for signup welcome email (optional; if unset, password is logged only)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@orm.brandthink.in"

    # Google reCAPTCHA v2 — test keys work on any domain for development
    RECAPTCHA_SECRET: str = "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ7GF_pA4"
    RECAPTCHA_ENABLED: bool = True

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.APP_ALLOWED_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
