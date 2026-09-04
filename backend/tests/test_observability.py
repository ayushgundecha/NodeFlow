import json
import logging

from app.services.observability import json_size, log_runtime_event, request_correlation_id


def test_runtime_log_contains_only_approved_metadata(caplog) -> None:
    secret = "never-log-this-payload"
    with caplog.at_level(logging.INFO, logger="nodeflow.runtime"):
        log_runtime_event(
            request_id="req_test",
            run_id="run_test",
            node_type="llm",
            status="failed",
            duration_ms=24,
            payload_size=json_size({"secret": secret}),
            error_code="ai_budget_exhausted",
        )

    payload = json.loads(caplog.records[-1].message)
    assert payload == {
        "duration_ms": 24,
        "error_code": "ai_budget_exhausted",
        "event": "nodeflow_runtime",
        "node_type": "llm",
        "payload_size": 35,
        "request_id": "req_test",
        "run_id": "run_test",
        "status": "failed",
    }
    assert secret not in caplog.text


def test_request_correlation_accepts_safe_values_and_replaces_untrusted_ones() -> None:
    assert request_correlation_id("deploy:request-1") == "deploy:request-1"
    assert request_correlation_id("bad value with spaces").startswith("req_")
