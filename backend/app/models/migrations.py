"""Explicit workflow-contract migration boundary.

Version changes are additive within a major schema version. A breaking change
must add a named, deterministic migration before old persisted data is accepted.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

from .workflow import SCHEMA_VERSION, WorkflowDefinition

WorkflowPayload = Mapping[str, Any]
Migration = Callable[[WorkflowPayload], WorkflowPayload]

MIGRATIONS: dict[str, Migration] = {}


class UnsupportedSchemaVersion(ValueError):
    """Raised when NodeFlow cannot safely upgrade a persisted workflow."""


def migrate_workflow_payload(payload: WorkflowPayload) -> WorkflowDefinition:
    """Migrate a raw workflow to the current contract or fail with guidance."""

    version = payload.get("schemaVersion", payload.get("schema_version"))
    if version == SCHEMA_VERSION:
        return WorkflowDefinition.model_validate(payload)

    migration = MIGRATIONS.get(str(version))
    if migration is None:
        raise UnsupportedSchemaVersion(
            f"Workflow schemaVersion {version!r} is unsupported. "
            f"This NodeFlow build accepts {SCHEMA_VERSION!r}."
        )

    return WorkflowDefinition.model_validate(migration(payload))
