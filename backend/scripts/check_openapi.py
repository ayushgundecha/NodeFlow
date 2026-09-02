"""Fail when the committed OpenAPI snapshot differs from application models."""

from __future__ import annotations

import json
from pathlib import Path

from main import app

SNAPSHOT_PATH = Path(__file__).resolve().parents[1] / "openapi.json"


def main() -> None:
    expected = json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"
    actual = SNAPSHOT_PATH.read_text(encoding="utf-8")
    if actual != expected:
        raise SystemExit(
            "OpenAPI contract drift detected. Run "
            "`cd backend && venv/bin/python -m scripts.export_openapi`, then "
            "`cd frontend && npm run contracts:generate`."
        )


if __name__ == "__main__":
    main()
