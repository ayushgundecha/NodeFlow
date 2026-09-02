import pytest

from app.config import LOCAL_ORIGINS, Settings


def test_development_configuration_has_safe_local_defaults() -> None:
    settings = Settings.from_environment({})

    assert settings.environment == "development"
    assert settings.cors_origins == LOCAL_ORIGINS


def test_production_requires_an_explicit_cors_allowlist() -> None:
    with pytest.raises(RuntimeError, match="NODEFLOW_CORS_ORIGINS"):
        Settings.from_environment({"NODEFLOW_ENV": "production"})


def test_vercel_deployments_are_treated_as_production() -> None:
    with pytest.raises(RuntimeError, match="NODEFLOW_CORS_ORIGINS"):
        Settings.from_environment({"VERCEL_ENV": "preview"})


def test_invalid_origin_fails_with_actionable_configuration_error() -> None:
    with pytest.raises(RuntimeError, match="Invalid NodeFlow configuration"):
        Settings.from_environment(
            {
                "NODEFLOW_ENV": "production",
                "NODEFLOW_CORS_ORIGINS": "javascript:alert(1)",
            }
        )
