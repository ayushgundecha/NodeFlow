"""Workflow validation and execution-planning API."""

from typing import Any

from fastapi import APIRouter

from ....models.workflow import ValidationResult
from ....services.workflow_validation import validate_workflow_payload

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.post("/validate", response_model=ValidationResult)
def validate_workflow_definition(workflow: dict[str, Any]) -> ValidationResult:
    """Return stable, canvas-addressable validation errors or execution layers."""

    return validate_workflow_payload(workflow)
