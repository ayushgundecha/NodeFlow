import json
from pathlib import Path

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)
FIXTURE_PATH = Path(__file__).parent / "fixtures" / "workflow.v1.json"


def test_health_reports_identity_without_configuration_values() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "nodeflow-api",
        "version": "1.0.0",
        "environment": "development",
    }


def test_cors_allows_local_frontend_and_rejects_unknown_origins() -> None:
    allowed = client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    rejected = client.options(
        "/api/v1/health",
        headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "access-control-allow-origin" not in rejected.headers


def test_openapi_contains_versioned_contract_components() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schemas = response.json()["components"]["schemas"]
    assert "WorkflowDefinition" in schemas
    assert "RunCompletedEvent" in schemas


def test_pipeline_parser_keeps_prototype_dag_behavior() -> None:
    response = client.post(
        "/api/v1/pipelines/parse",
        json={
            "nodes": [
                {"id": "a", "type": "text"},
                {"id": "b", "type": "output"},
            ],
            "edges": [{"source": "a", "target": "b"}],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"num_nodes": 2, "num_edges": 1, "is_dag": True}


def test_workflow_validation_endpoint_returns_execution_plan() -> None:
    response = client.post(
        "/api/v1/workflows/validate",
        json={
            "schemaVersion": "1.0",
            "id": "api.validation",
            "name": "API validation",
            "nodes": [
                {
                    "id": "input",
                    "type": "manualInput",
                    "position": {"x": 0, "y": 0},
                    "config": {"inputKey": "payload", "defaultValue": None},
                },
                {
                    "id": "output",
                    "type": "output",
                    "position": {"x": 200, "y": 0},
                    "config": {"label": "Result", "format": "json"},
                },
            ],
            "edges": [
                {
                    "id": "edge.input-output",
                    "source": "input",
                    "sourceHandle": "value",
                    "target": "output",
                    "targetHandle": "value",
                }
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "valid": True,
        "errors": [],
        "warnings": [],
        "executionOrder": [["input"], ["output"]],
    }


def test_workflow_validation_endpoint_returns_version_errors_as_a_result() -> None:
    response = client.post(
        "/api/v1/workflows/validate",
        json={"schemaVersion": "9.0", "id": "old", "name": "Old workflow"},
    )

    assert response.status_code == 200
    assert response.json()["errors"] == [
        {
            "code": "schema_version_unsupported",
            "severity": "error",
            "message": "Use schemaVersion '1.0' or migrate this workflow before running it.",
            "nodeId": None,
            "edgeId": None,
            "field": "schemaVersion",
        }
    ]


def test_run_endpoint_streams_complete_ordered_sse_wire_sequence() -> None:
    workflow = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    workflow["nodes"][1]["config"]["template"] = "Hello, {{ input.name }}!"

    with client.stream(
        "POST",
        "/api/v1/runs",
        json={"workflow": workflow, "input": None, "clientRunId": "client-test-1"},
    ) as response:
        body = "".join(response.iter_text())
        headers = response.headers

    frames = [frame for frame in body.split("\n\n") if frame and not frame.startswith(":")]
    events = [json.loads(frame.split("data: ", 1)[1]) for frame in frames]

    assert response.status_code == 200
    assert headers["content-type"].startswith("text/event-stream")
    assert headers["cache-control"] == "no-cache, no-transform"
    assert headers["x-accel-buffering"] == "no"
    assert headers["x-request-id"].startswith("req_")
    assert [event["sequence"] for event in events] == list(range(len(events)))
    assert [event["type"] for event in events] == [
        "run.started",
        "node.queued",
        "node.started",
        "node.log",
        "node.completed",
        "node.queued",
        "node.started",
        "node.log",
        "node.completed",
        "node.queued",
        "node.started",
        "node.log",
        "node.completed",
        "run.completed",
    ]
    assert events[-1]["outputs"] == {"Greeting": "Hello, Ada!"}


def test_api_request_size_is_bounded_before_contract_parsing() -> None:
    response = client.post(
        "/api/v1/workflows/validate",
        content=b"x" * (512 * 1024 + 1),
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 413
    assert response.json() == {"detail": "API request exceeds the 512 KB limit."}
