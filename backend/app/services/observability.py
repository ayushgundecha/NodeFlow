"""Privacy-safe structured runtime metadata.

Never add workflow payloads, prompts, source, outputs, authorization headers, or
network addresses to this module's log records.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from uuid import uuid4

LOGGER = logging.getLogger("nodeflow.runtime")
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,80}$")


def request_correlation_id(candidate: str | None) -> str:
    if candidate and REQUEST_ID_PATTERN.fullmatch(candidate):
        return candidate
    return f"req_{uuid4().hex}"


def json_size(value: object) -> int:
    try:
        return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())
    except (TypeError, ValueError):
        return 0


def log_runtime_event(
    *,
    request_id: str,
    run_id: str,
    status: str,
    node_type: str | None = None,
    duration_ms: int | None = None,
    payload_size: int = 0,
    error_code: str | None = None,
) -> None:
    record: dict[str, Any] = {
        "event": "nodeflow_runtime",
        "request_id": request_id,
        "run_id": run_id,
        "status": status,
        "node_type": node_type,
        "duration_ms": duration_ms,
        "payload_size": payload_size,
        "error_code": error_code,
    }
    LOGGER.info(json.dumps(record, separators=(",", ":"), sort_keys=True))
