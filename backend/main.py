"""ASGI entrypoint for local Uvicorn and Vercel's FastAPI service."""

from app.application import create_app
from app.config import Settings

settings = Settings.from_environment()
app = create_app(settings)
