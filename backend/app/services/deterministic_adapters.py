"""Safe deterministic adapters for NodeFlow's provider-free node types.

Behavior summary:
- Manual Input resolves its configured key from run input, then uses its default.
- Template interpolates safe dotted lookups such as ``{{ input.user.name }}``.
- Transform supports ``@``, dotted ``@.path`` lookups, and JSON projections whose
  leaf strings are lookups.
- Condition evaluates one declarative comparison and activates true or false.
- Merge combines handle values as an ordered array or a conflict-free object.
- Delay waits cooperatively for at most 30 seconds and passes its input through.
- Output captures its input through the scheduler and produces no outgoing value.
"""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from pydantic import TypeAdapter, ValidationError

from ..models.base import JsonValue
from ..models.workflow import (
    ConditionNode,
    DelayNode,
    ManualInputNode,
    MergeNode,
    OutputNode,
    TemplateNode,
    TransformNode,
    WorkflowNode,
)
from .scheduler import NodeAdapter, NodeExecutionContext, NodeExecutionResult

JSON_ADAPTER: TypeAdapter[JsonValue] = TypeAdapter(JsonValue)
TEMPLATE_EXPRESSION = re.compile(r"{{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*}}")
LOOKUP_EXPRESSION = re.compile(r"^@(?:\.([A-Za-z0-9_.]+))?$")


@dataclass(frozen=True, slots=True)
class AdapterExecutionError(ValueError):
    code: str
    message: str

    def __str__(self) -> str:
        return self.message


def _validated(value: Any) -> JsonValue:
    try:
        return JSON_ADAPTER.validate_python(value)
    except ValidationError as error:
        raise AdapterExecutionError(
            "output_invalid", "Node output must be bounded JSON-serializable data."
        ) from error


def _resolve_path(value: JsonValue, path: str) -> JsonValue:
    current = value
    if not path:
        return current
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        elif isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
        else:
            raise AdapterExecutionError(
                "path_missing", f"Path {path!r} does not exist in the incoming value."
            )
    return current


def _render_value(value: JsonValue) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


class ManualInputAdapter:
    async def execute(
        self, node: WorkflowNode, context: NodeExecutionContext
    ) -> NodeExecutionResult:
        if not isinstance(node, ManualInputNode):
            raise AdapterExecutionError(
                "adapter_mismatch", "Manual Input adapter received wrong node."
            )
        value = node.config.default_value
        if isinstance(context.run_input, dict) and node.config.input_key in context.run_input:
            value = context.run_input[node.config.input_key]
        elif context.run_input is not None and not isinstance(context.run_input, dict):
            value = context.run_input
        return NodeExecutionResult(outputs={"value": _validated(value)})


class TemplateAdapter:
    async def execute(
        self, node: WorkflowNode, context: NodeExecutionContext
    ) -> NodeExecutionResult:
        if not isinstance(node, TemplateNode):
            raise AdapterExecutionError("adapter_mismatch", "Template adapter received wrong node.")
        incoming = context.first_input("input")
        variables: dict[str, JsonValue] = {"input": incoming}
        if isinstance(incoming, dict):
            variables.update(incoming)

        matches = list(TEMPLATE_EXPRESSION.finditer(node.config.template))
        residue = TEMPLATE_EXPRESSION.sub("", node.config.template)
        if "{{" in residue or "}}" in residue:
            raise AdapterExecutionError(
                "template_invalid", "Template expressions must use safe dotted lookups."
            )

        def replace(match: re.Match[str]) -> str:
            expression = match.group(1)
            root, _, path = expression.partition(".")
            if root not in variables:
                raise AdapterExecutionError(
                    "path_missing", f"Template variable {root!r} is not available."
                )
            return _render_value(_resolve_path(variables[root], path))

        rendered = (
            TEMPLATE_EXPRESSION.sub(replace, node.config.template)
            if matches
            else node.config.template
        )
        return NodeExecutionResult(outputs={"output": _validated(rendered)})


def _transform_leaf(value: JsonValue, incoming: JsonValue) -> JsonValue:
    if isinstance(value, str):
        match = LOOKUP_EXPRESSION.fullmatch(value)
        return _resolve_path(incoming, match.group(1) or "") if match else value
    if isinstance(value, list):
        return [_transform_leaf(item, incoming) for item in value]
    if isinstance(value, dict):
        return {key: _transform_leaf(item, incoming) for key, item in value.items()}
    return value


class TransformAdapter:
    async def execute(
        self, node: WorkflowNode, context: NodeExecutionContext
    ) -> NodeExecutionResult:
        if not isinstance(node, TransformNode):
            raise AdapterExecutionError(
                "adapter_mismatch", "Transform adapter received wrong node."
            )
        incoming = context.first_input("input")
        lookup = LOOKUP_EXPRESSION.fullmatch(node.config.expression)
        if lookup:
            output = _resolve_path(incoming, lookup.group(1) or "")
        else:
            try:
                projection = json.loads(node.config.expression)
            except json.JSONDecodeError as error:
                raise AdapterExecutionError(
                    "transform_invalid",
                    "Transform must be @, @.path, or a JSON projection containing lookups.",
                ) from error
            output = _transform_leaf(projection, incoming)
        return NodeExecutionResult(outputs={"output": _validated(output)})


def _compare(operator: str, actual: JsonValue, expected: JsonValue) -> bool:
    if operator == "eq":
        return actual == expected
    if operator == "ne":
        return actual != expected
    if operator == "exists":
        return actual is not None
    if operator == "contains":
        if isinstance(actual, (str, list, dict)):
            return expected in actual
        raise AdapterExecutionError(
            "condition_type_invalid", "contains requires text, array, or object."
        )
    if operator in {"gt", "gte", "lt", "lte"}:
        if not isinstance(actual, (int, float)) or isinstance(actual, bool):
            raise AdapterExecutionError("condition_type_invalid", f"{operator} requires numbers.")
        if not isinstance(expected, (int, float)) or isinstance(expected, bool):
            raise AdapterExecutionError("condition_type_invalid", f"{operator} requires numbers.")
        return {
            "gt": actual > expected,
            "gte": actual >= expected,
            "lt": actual < expected,
            "lte": actual <= expected,
        }[operator]
    raise AdapterExecutionError("condition_operator_invalid", f"Unsupported operator {operator!r}.")


class ConditionAdapter:
    async def execute(
        self, node: WorkflowNode, context: NodeExecutionContext
    ) -> NodeExecutionResult:
        if not isinstance(node, ConditionNode):
            raise AdapterExecutionError(
                "adapter_mismatch", "Condition adapter received wrong node."
            )
        rule = node.config.rule
        path = rule.get("path", "")
        operator = rule.get("operator")
        if not isinstance(path, str) or not isinstance(operator, str):
            raise AdapterExecutionError(
                "condition_invalid", "Condition requires string path and operator fields."
            )
        incoming = context.first_input("input")
        try:
            actual = _resolve_path(incoming, path)
        except AdapterExecutionError:
            if operator == "exists":
                actual = None
            else:
                raise
        matched = _compare(operator, actual, rule.get("value"))
        active = "true" if matched else "false"
        return NodeExecutionResult(
            outputs={"true": incoming, "false": incoming},
            active_output_handles=frozenset({active}),
        )


class MergeAdapter:
    async def execute(
        self, node: WorkflowNode, context: NodeExecutionContext
    ) -> NodeExecutionResult:
        if not isinstance(node, MergeNode):
            raise AdapterExecutionError("adapter_mismatch", "Merge adapter received wrong node.")
        items = context.inputs.get("items", ())
        if node.config.strategy == "array":
            output: JsonValue = list(items)
        else:
            merged: dict[str, JsonValue] = {}
            for item in items:
                if not isinstance(item, dict):
                    raise AdapterExecutionError(
                        "merge_type_invalid", "Object merge accepts object inputs only."
                    )
                conflicts = sorted(merged.keys() & item.keys())
                if conflicts:
                    raise AdapterExecutionError(
                        "merge_conflict",
                        "Object merge found duplicate keys: " + ", ".join(conflicts) + ".",
                    )
                merged.update(item)
            output = merged
        return NodeExecutionResult(outputs={"output": _validated(output)})


class DelayAdapter:
    async def execute(
        self, node: WorkflowNode, context: NodeExecutionContext
    ) -> NodeExecutionResult:
        if not isinstance(node, DelayNode):
            raise AdapterExecutionError("adapter_mismatch", "Delay adapter received wrong node.")
        if not 0 <= node.config.milliseconds <= 30_000:
            raise AdapterExecutionError("delay_invalid", "Delay must be between 0 and 30000ms.")
        if node.config.milliseconds:
            try:
                await asyncio.wait_for(
                    context.cancellation.wait(), timeout=node.config.milliseconds / 1_000
                )
            except TimeoutError:
                pass
            else:
                raise asyncio.CancelledError
        return NodeExecutionResult(outputs={"output": context.first_input("input")})


class OutputAdapter:
    async def execute(
        self, node: WorkflowNode, context: NodeExecutionContext
    ) -> NodeExecutionResult:
        if not isinstance(node, OutputNode):
            raise AdapterExecutionError("adapter_mismatch", "Output adapter received wrong node.")
        _validated(context.first_input("value"))
        return NodeExecutionResult()


def deterministic_adapters() -> Mapping[str, NodeAdapter]:
    """Return the provider-free adapter registry used by the Phase 3 runtime."""

    return {
        "manualInput": ManualInputAdapter(),
        "template": TemplateAdapter(),
        "transform": TransformAdapter(),
        "condition": ConditionAdapter(),
        "merge": MergeAdapter(),
        "delay": DelayAdapter(),
        "output": OutputAdapter(),
    }
