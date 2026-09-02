"""Versioned API composition."""

from fastapi import APIRouter

from .routes.health import router as health_router
from .routes.pipelines import router as pipelines_router
from .routes.runs import router as runs_router
from .routes.workflows import router as workflows_router

router = APIRouter(prefix="/api/v1")
router.include_router(health_router)
router.include_router(pipelines_router)
router.include_router(runs_router)
router.include_router(workflows_router)
