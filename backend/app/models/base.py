"""Shared primitives and safety limits for NodeFlow's transport models."""

from __future__ import annotations

import json
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict
from pydantic import JsonValue as PydanticJsonValue

MAX_JSON_BYTES = 256 * 1024
MAX_JSON_DEPTH = 20


def to_camel(value: str) -> str:
    """Convert a snake_case field name to the camelCase API convention."""

    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ContractModel(BaseModel):
    """Strict base model for every public NodeFlow contract."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="forbid",
        populate_by_name=True,
        serialize_by_alias=True,
    )


def _validate_json_limits(value: PydanticJsonValue) -> PydanticJsonValue:
    """Reject pathological payloads before they reach an executor or browser."""

    encoded_size = len(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    if encoded_size > MAX_JSON_BYTES:
        raise ValueError(f"JSON values may not exceed {MAX_JSON_BYTES} bytes")

    stack: list[tuple[PydanticJsonValue, int]] = [(value, 1)]
    while stack:
        current, depth = stack.pop()
        if depth > MAX_JSON_DEPTH:
            raise ValueError(f"JSON values may not exceed depth {MAX_JSON_DEPTH}")
        if isinstance(current, list):
            stack.extend((item, depth + 1) for item in current)
        elif isinstance(current, dict):
            stack.extend((item, depth + 1) for item in current.values())

    return value


JsonValue = Annotated[PydanticJsonValue, AfterValidator(_validate_json_limits)]
