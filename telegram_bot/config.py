from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Configuración del Bot de Telegram."""
    TELEGRAM_BOT_TOKEN: str = "YOUR_TELEGRAM_BOT_TOKEN"
    SIAE_BACKEND_URL: str = "http://backend:8000"
    BOT_API_KEY: str = "siae_bot_secret_key_2026"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
