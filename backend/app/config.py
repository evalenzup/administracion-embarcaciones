"""
SIAE — Sistema de Administración de Embarcaciones
Configuración centralizada con pydantic-settings.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Configuración de la aplicación cargada desde variables de entorno."""

    # ── Base de datos ──
    POSTGRES_USER: str = "siae_user"
    POSTGRES_PASSWORD: str = "siae_dev_2024"
    POSTGRES_DB: str = "siae_db"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432
    DATABASE_URL: str = "postgresql://siae_user:siae_dev_2024@db:5432/siae_db"

    # ── JWT ──
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Superadmin ──
    SUPERADMIN_USERNAME: str = "admin"
    SUPERADMIN_PASSWORD: str = "admin123"
    SUPERADMIN_EMAIL: str = "admin@cicese.mx"

    # ── Telemetry ──
    TELEMETRY_API_KEY: str = "siae_telemetry_secret_key_2026"

    # ── Bot de Telegram ──
    BOT_API_KEY: str = "siae_bot_secret_key_2026"
    TELEGRAM_BOT_USERNAME: str = "siae_deo_bot"
    TELEGRAM_BOT_TOKEN: str = ""

    # ── Uploads ──
    UPLOAD_DIR: str = "/app/uploads"
    MAX_UPLOAD_SIZE_MB: int = 50

    # ── SMTP / Correo ──
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_FROM_NAME: str = "SIAE — DEO CICESE"
    SMTP_TLS: bool = True
    SMTP_SSL: bool = False

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Singleton de settings cacheado."""
    return Settings()
