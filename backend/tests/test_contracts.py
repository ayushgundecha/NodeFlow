import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.models.events import RunEventStream
from app.models.migrations import UnsupportedSchemaVersion, migrate_workflow_payload
from app.models.workflow import WorkflowDefinition

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "workflow.v1.json"


def load_fixture() -> dict[str, object]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_workflow_fixture_round_trips_with_camel_case() -> None:
    source = load_fixture()
    workflow = WorkflowDefinition.model_validate(source)

    assert workflow.model_dump(mode="json", by_alias=True) == source


def test_unknown_workflow_version_fails_with_guidance() -> None:
    with pytest.raises(UnsupportedSchemaVersion, match=r"accepts '1\.0'"):
        migrate_workflow_payload({**load_fixture(), "schemaVersion": "9.0"})


def test_run_event_stream_requires_contiguous_single_run_events() -> None:
    with pytest.raises(ValidationError, match="contiguous"):
        RunEventStream.model_validate(
            {
                "events": [
                    {
                        "type": "run.started",
                        "runId": "run-1",
                        "clientRunId": "client-1",
                        "sequence": 1,
                        "occurredAt": "2026-09-02T00:00:00Z",
                    }
                ]
            }
        )
