"""Operational health endpoint."""

from fastapi import APIRouter, Request

from ....config import Settings
from ....models.base import ContractModel

router = APIRouter(tags=["health"])


class HealthResponse(ContractModel):
    status: str = "ok"
    service: str
    version: str
    environment: str


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    settings: Settings = request.app.state.settings
    return HealthResponse(
        service=settings.service_name,
        version=settings.version,
        environment=settings.environment,
    )
