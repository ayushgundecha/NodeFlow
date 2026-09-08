"""Validated, server-only NodeFlow configuration."""

from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

LOCAL_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    environment: Literal["development", "test", "production"] = "development"
    service_name: str = "nodeflow-api"
    version: str = "1.0.0"
    cors_origins: tuple[str, ...] = Field(default=LOCAL_ORIGINS)

    @model_validator(mode="after")
    def validate_production(self) -> Settings:
        if self.environment == "production" and not self.cors_origins:
            raise ValueError("NODEFLOW_CORS_ORIGINS is required when NODEFLOW_ENV=production")
        invalid = []
        for origin in self.cors_origins:
            parsed = urlsplit(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.path
                or parsed.query
                or parsed.fragment
                or "*" in origin
            ):
                invalid.append(origin)
        if invalid:
            raise ValueError("CORS origins must be absolute http(s) URLs")
        return self

    @classmethod
    def from_environment(cls, environment: Mapping[str, str] | None = None) -> Settings:
        values = os.environ if environment is None else environment
        deployment = values.get("NODEFLOW_ENV")
        if deployment is None:
            deployment = (
                "production"
                if values.get("VERCEL_ENV") in {"production", "preview"}
                else "development"
            )
        raw_origins = values.get("NODEFLOW_CORS_ORIGINS")
        if raw_origins is None:
            origins: tuple[str, ...] = () if deployment == "production" else LOCAL_ORIGINS
        else:
            origins = tuple(origin.strip() for origin in raw_origins.split(",") if origin.strip())

        if deployment == "production" and origins:
            salt = values.get("NODEFLOW_RATE_LIMIT_SALT", "")
            if len(salt) < 32 or salt.startswith("replace-with"):
                raise RuntimeError(
                    "NODEFLOW_RATE_LIMIT_SALT must contain at least 32 random "
                    "characters in production."
                )

        try:
            return cls(environment=deployment, cors_origins=origins)
        except ValidationError as error:
            raise RuntimeError(
                "Invalid NodeFlow configuration. Check NODEFLOW_ENV and "
                "NODEFLOW_CORS_ORIGINS against .env.example."
            ) from error
