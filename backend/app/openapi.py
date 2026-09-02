"""OpenAPI helpers that publish contract-only models as reusable components."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from pydantic import TypeAdapter

from .models.events import RunEventStream
from .models.workflow import ContractCatalog


def install_contract_openapi(app: FastAPI) -> None:
    """Install a cached OpenAPI generator containing every public contract."""

    def custom_openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema

        schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )
        components = schema.setdefault("components", {}).setdefault("schemas", {})

        for adapter in (TypeAdapter(ContractCatalog), TypeAdapter(RunEventStream)):
            contract_schema = adapter.json_schema(ref_template="#/components/schemas/{model}")
            components.update(contract_schema.pop("$defs", {}))

        app.openapi_schema = schema
        return schema

    app.openapi = custom_openapi  # type: ignore[method-assign]
