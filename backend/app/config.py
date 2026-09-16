from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")
    database_url: str = "postgresql+psycopg://fenix:fenix@127.0.0.1:5432/fenix?connect_timeout=5"
    frontend_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"
    cookie_secure: bool = False
    enable_docs: bool = True
    temp_password_expiration_hours: int = 24
    session_hours: int = 12
    remember_session_days: int = 30
    idle_timeout_minutes: int = 60
    max_upload_size_mb: int = 10
    upload_dir: str = "private_uploads"
    login_limit: int = 20
    lockout_minutes: int = 15

    @property
    def origins(self):
        return list({self.frontend_url, *[x.strip() for x in self.cors_origins.split(",") if x.strip()]})


@lru_cache
def settings():
    return Settings()
