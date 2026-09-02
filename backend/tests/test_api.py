from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


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
